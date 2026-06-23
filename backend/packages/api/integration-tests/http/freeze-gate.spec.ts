import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';

jest.setTimeout(120 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ getContainer }) => {
    describe('freeze gate', () => {
      it('a frozen account reports availableBalance 0 and cannot settle an open', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const cid = 'cust_freeze_1';

        // Seed a positive ledger balance.
        await packs.mutateCreditAtomic({
          customerId: cid,
          amount: 100,
          reason: 'topup',
        });
        expect(await packs.availableBalance(cid)).toBeCloseTo(100);

        // Insert a frozen customer_account_state row.
        await packs.createCustomerAccountStates([
          {
            customer_id: cid,
            frozen: true,
            cause: 'manual',
            frozen_reason: 'test',
            frozen_by: 'admin_x',
          },
        ]);

        // After freeze: availableBalance must be 0.
        expect(await packs.availableBalance(cid)).toBe(0);

        // After freeze: settleOpen must throw /frozen/i.
        await expect(
          packs.settleOpen({
            customerId: cid,
            amount: -10,
            sourceTransactionId: 'open_freeze_1',
          }),
        ).rejects.toThrow(/frozen/i);
      });
    });
  },
});
