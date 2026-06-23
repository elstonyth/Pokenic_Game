// Credit top-up rules + the mock payment gateway (Task A1). Both are pure so
// the workflow step stays a thin orchestrator and the rules are unit-testable
// without a container.

// Per-request ceiling. Generous for a collectibles site, small enough that a
// typo (or a scripted loop) can't mint an absurd balance in one call.
export const TOPUP_MAX_USD = 10_000;

// Why a message-or-null helper instead of throwing: the step owns the
// MedusaError type (NOT_ALLOWED vs INVALID_DATA), the rule only knows money.
export function topUpAmountError(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Amount must be a number.';
  }
  if (value <= 0) {
    return 'Amount must be greater than zero.';
  }
  if (value > TOPUP_MAX_USD) {
    return `Amount must be at most $${TOPUP_MAX_USD.toLocaleString('en-US')} per top-up.`;
  }
  // 2dp max, checked against the binary representation: 10.1 * 100 is
  // 1009.9999999999999, so an exact integer-cents comparison would reject
  // valid money — the epsilon forgives float error, not sub-cent precision.
  const cents = value * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    return 'Amount cannot be more precise than a cent.';
  }
  return null;
}

// Security audit 2026-06-23: the mock gateway always approves, so it MINTS free
// spendable credit. It must be inert in production unless an operator explicitly
// opts in — otherwise any authenticated customer can mint money. Pure (env is
// injected) so the policy is unit-testable without a running server.
export function mockTopupAllowed(
  env: { NODE_ENV?: string; ALLOW_MOCK_TOPUP?: string } = process.env,
): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return env.ALLOW_MOCK_TOPUP === 'true';
}

// Customer-scoped idempotency anchor for a top-up. A replayed request carrying
// the same Idempotency-Key resolves to this same ledger `reference`, so the
// per-customer locked dedupe in mutateCreditAtomic returns the existing row
// instead of appending a second credit (the audit's no-idempotency finding).
// Namespaced by customer so two customers' identical keys never collide, and
// prefixed so it never collides with the mock gateway's `mock_…` references.
export function topupIdempotencyReference(
  customerId: string,
  key: string,
): string {
  return `topup-idem:${customerId}:${key}`;
}

export type MockChargeInput = {
  amount: number;
  customer_id: string;
};

export type MockChargeResult =
  | { ok: true; reference: string }
  | { ok: false; declined_reason: string };

// Unique-enough for a demo gateway; the DB row id is the real identity.
let chargeSeq = 0;

/**
 * The payment-gateway seam: the real gateway replaces exactly this function
 * (same input, same result shape). Always approves, except amounts ending in
 * .13 — a deliberate fake decline so the UI's error path stays testable
 * end-to-end without a real gateway.
 */
export function mockCharge(input: MockChargeInput): MockChargeResult {
  const cents = Math.round(input.amount * 100);
  if (cents % 100 === 13) {
    return {
      ok: false,
      declined_reason:
        'Payment declined by the demo gateway (amounts ending in .13 always decline).',
    };
  }
  return {
    ok: true,
    reference: `mock_${Date.now().toString(36)}_${(chargeSeq++).toString(36)}`,
  };
}
