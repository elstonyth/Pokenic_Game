import { describe, it, expect } from 'vitest';
import { mapVaultItem, type BackendVaultItem } from '@/lib/actions/vault-map';

const raw = (buyback: BackendVaultItem['buyback']): BackendVaultItem => ({
  pull_id: 'pull_1',
  rolled_at: '2026-07-01T00:00:00Z',
  pack_id: 'pack_1',
  pack_title: 'Test Pack',
  card: {
    handle: 'test-card',
    name: 'Test Card',
    image: '/card.png',
    slab_image: null,
    rarity: 'rare',
    market_value: 100,
    marketPriceMyr: 450,
  },
  buyback,
});

describe('mapVaultItem buyback firmness', () => {
  // PR #129 review: an older backend omits `firm` entirely — it must map to
  // firm (pre-firmness behavior), never to a falsy "sells disabled" state.
  it('defaults a missing firm flag to true (older backend)', () => {
    const item = mapVaultItem(raw({ percent: 90, amount: 405 }));
    expect(item.buyback).toEqual({ percent: 90, amount: 405, firm: true });
  });

  it('passes firm:false through so sell CTAs can disable', () => {
    const item = mapVaultItem(raw({ percent: 90, amount: 405, firm: false }));
    expect(item.buyback.firm).toBe(false);
  });

  it('passes firm:true through unchanged', () => {
    const item = mapVaultItem(raw({ percent: 90, amount: 405, firm: true }));
    expect(item.buyback.firm).toBe(true);
  });
});
