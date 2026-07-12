/**
 * Commission-maturity job — per-beneficiary transaction semantics (plan 021).
 *
 * matureDueCommissions now runs one SHORT transaction per beneficiary (one
 * credit: advisory lock each) and notifies AFTER each commit. Cases:
 *  1. Happy path: 2 beneficiaries × 2 due pending rows → all flipped, count matches.
 *  2. Notify failure isolates AND flips still commit: a stub that throws for
 *     beneficiary B only — A's rows flipped, B's rows ALSO flipped (flip
 *     committed before notify), method does not throw. Under the old
 *     single-transaction code a notify throw rolled back every flip.
 *  3. Idempotent re-run: second run flips 0 and never re-notifies.
 *  4. Status guard: a 'reversed' commission with past matures_at is not flipped.
 */
import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';

jest.setTimeout(120 * 1000);

const PAST = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago

// Seed a commission row (credit_transaction backing row + commission), same
// path as the module-level mature-commissions spec.
async function seedCommission(
  packs: PacksModuleService,
  opts: {
    beneficiary: string;
    status: 'pending' | 'reversed';
    sourceTransactionId: string;
  },
) {
  const ct = await packs.createCreditTransactions({
    customer_id: opts.beneficiary,
    amount: 1.0,
    reason: 'direct_referral',
    source_transaction_id: opts.sourceTransactionId,
    reference: null,
    pull_id: null,
    external_funded_cents: 0,
  });

  return packs.createCommissions({
    credit_transaction_id: ct.id,
    beneficiary: opts.beneficiary,
    source_transaction_id: opts.sourceTransactionId,
    generation: 1,
    kind: 'direct',
    status: opts.status,
    matures_at: PAST,
    effective_pct: 0.01,
    reversal_transaction_id: null,
  });
}

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ getContainer }) => {
    describe('matureDueCommissions (per-beneficiary transactions, plan 021)', () => {
      it('flips all due rows across 2 beneficiaries; flipped count matches; notify per row', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const a = 'cust_m21_happy_a';
        const b = 'cust_m21_happy_b';
        const seeded = [
          await seedCommission(packs, { beneficiary: a, status: 'pending', sourceTransactionId: 'open_m21_h1' }),
          await seedCommission(packs, { beneficiary: a, status: 'pending', sourceTransactionId: 'open_m21_h2' }),
          await seedCommission(packs, { beneficiary: b, status: 'pending', sourceTransactionId: 'open_m21_h3' }),
          await seedCommission(packs, { beneficiary: b, status: 'pending', sourceTransactionId: 'open_m21_h4' }),
        ];

        const notify = jest
          .fn<Promise<void>, [string, string, boolean]>()
          .mockResolvedValue(undefined);

        const { flipped } = await packs.matureDueCommissions(notify);

        // Fresh per-suite DB and this test runs first — the only due rows are ours.
        expect(flipped).toBe(4);

        for (const c of seeded) {
          const [row] = await packs.listCommissions({ id: c.id }, { take: 1 });
          expect(row!.status).toBe('available');
          const calls = notify.mock.calls.filter(([, id]) => id === c.id);
          expect(calls).toHaveLength(1);
          expect(calls[0]![0]).toBe(c.beneficiary);
          expect(calls[0]![2]).toBe(false); // not frozen
        }
      });

      it('a notify throw for one beneficiary does NOT roll back flips or abort the rest', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const a = 'cust_m21_iso_a';
        const b = 'cust_m21_iso_b';
        const commA = await seedCommission(packs, { beneficiary: a, status: 'pending', sourceTransactionId: 'open_m21_i1' });
        const commB = await seedCommission(packs, { beneficiary: b, status: 'pending', sourceTransactionId: 'open_m21_i2' });

        const notify = jest.fn(
          async (beneficiaryId: string): Promise<void> => {
            if (beneficiaryId === b) throw new Error('feed write failed');
          },
        );

        // Method must not throw (notify is best-effort, post-commit).
        const { flipped } = await packs.matureDueCommissions(notify);
        expect(flipped).toBe(2);

        // A's row flipped…
        const [rowA] = await packs.listCommissions({ id: commA.id }, { take: 1 });
        expect(rowA!.status).toBe('available');
        // …and B's row ALSO flipped: the flip committed before notify ran.
        // (Old single-transaction code would have rolled this back.)
        const [rowB] = await packs.listCommissions({ id: commB.id }, { take: 1 });
        expect(rowB!.status).toBe('available');
      });

      it('re-run flips 0 and does not re-notify already-flipped ids', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const bene = 'cust_m21_idem';
        const comm = await seedCommission(packs, { beneficiary: bene, status: 'pending', sourceTransactionId: 'open_m21_r1' });

        const notify1 = jest
          .fn<Promise<void>, [string, string, boolean]>()
          .mockResolvedValue(undefined);
        const first = await packs.matureDueCommissions(notify1);
        expect(first.flipped).toBe(1);
        expect(notify1.mock.calls.filter(([, id]) => id === comm.id)).toHaveLength(1);

        const notify2 = jest
          .fn<Promise<void>, [string, string, boolean]>()
          .mockResolvedValue(undefined);
        const second = await packs.matureDueCommissions(notify2);
        expect(second.flipped).toBe(0);
        expect(notify2).not.toHaveBeenCalled();

        const [row] = await packs.listCommissions({ id: comm.id }, { take: 1 });
        expect(row!.status).toBe('available');
      });

      it("never flips a 'reversed' commission even with past matures_at", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const bene = 'cust_m21_guard';
        const comm = await seedCommission(packs, { beneficiary: bene, status: 'reversed', sourceTransactionId: 'open_m21_g1' });

        const notify = jest
          .fn<Promise<void>, [string, string, boolean]>()
          .mockResolvedValue(undefined);
        const { flipped } = await packs.matureDueCommissions(notify);

        expect(flipped).toBe(0);
        expect(notify).not.toHaveBeenCalled();
        const [row] = await packs.listCommissions({ id: comm.id }, { take: 1 });
        expect(row!.status).toBe('reversed');
      });
    });
  },
});
