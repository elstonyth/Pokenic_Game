import { describe, it, expect } from 'vitest';
import { reasonLabel, signedRm } from '@/lib/transactions';

describe('reasonLabel', () => {
  it('maps each reason to a human label', () => {
    expect(reasonLabel('topup')).toBe('Top-up');
    expect(reasonLabel('pack_open')).toBe('Pack open');
    expect(reasonLabel('buyback')).toBe('Sell-back');
    expect(reasonLabel('adjustment')).toBe('Adjustment');
  });
  it('labels the VIP commission reasons the backend now emits', () => {
    expect(reasonLabel('direct_referral')).toBe('Referral commission');
    expect(reasonLabel('team_override')).toBe('Team override');
    expect(reasonLabel('commission_reversal')).toBe('Commission reversal');
    expect(reasonLabel('cashout')).toBe('Cashout');
  });
});

describe('signedRm', () => {
  it('prefixes a sign and formats the magnitude', () => {
    expect(signedRm(48)).toBe('+RM 48.00');
    expect(signedRm(-25)).toBe('-RM 25.00');
    expect(signedRm(0)).toBe('RM 0.00');
  });
});
