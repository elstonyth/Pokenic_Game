import { ledgerTotals } from '../economy';

// Task A5 — reward reasons must land in the non-revenue rewardPromo bucket
// and must NOT affect net / revenue.

describe('ledgerTotals — reward reasons', () => {
  it('puts reward_credit amount into rewardPromo, not revenue/net', () => {
    const result = ledgerTotals([{ reason: 'reward_credit', amount: 10 }]);
    expect(result.rewardPromo).toBe(10);
    expect(result.revenue).toBe(0);
    expect(result.net).toBe(0);
  });

  it('puts voucher_claim amount into rewardPromo, not revenue/net', () => {
    const result = ledgerTotals([{ reason: 'voucher_claim', amount: 5 }]);
    expect(result.rewardPromo).toBe(5);
    expect(result.revenue).toBe(0);
    expect(result.net).toBe(0);
  });

  it('sums both reward reasons into rewardPromo independently of revenue', () => {
    const result = ledgerTotals([
      { reason: 'pack_open', amount: -100 },
      { reason: 'buyback', amount: 20 },
      { reason: 'voucher_claim', amount: 5 },
      { reason: 'reward_credit', amount: 3 },
    ]);
    expect(result.rewardPromo).toBe(8);
    expect(result.revenue).toBe(100);
    // net = revenue - payouts - commissions (rewardPromo excluded)
    expect(result.net).toBe(80);
  });

  it('returns zero rewardPromo on an empty ledger', () => {
    expect(ledgerTotals([]).rewardPromo).toBe(0);
  });
});
