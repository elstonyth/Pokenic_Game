import { describe, it, expect } from 'vitest';
import { DailyStateSchema, DrawBoxSchema, parseOne } from '@/lib/data/schemas';

describe('DailyStateSchema', () => {
  const fullFixture = {
    redemption_enabled: true,
    box: {
      tier: 'a',
      name: 'Box A',
      draws_per_day: 3,
      draws_today: 1,
      next_reset: '2026-07-05T00:00:00.000Z',
      prizes: [
        { kind: 'credit', amount_myr: 5 },
        { kind: 'product', title: 'Charizard Slab', image: '/x.png' },
      ],
    },
    vouchers: {
      claimable: [
        {
          id: 'grant_1',
          kind: 'voucher',
          level: 4,
          payload: { amount_myr: 10 },
          granted_at: '2026-07-04T00:00:00.000Z',
        },
      ],
      claimed: [
        {
          id: 'grant_2',
          kind: 'frame',
          level: 2,
          payload: null,
          granted_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    },
    ship_prizes: [
      {
        pull_id: 'pull_1',
        prize_kind: 'product',
        prize_snapshot: { title: 'Pikachu Slab' },
        status: 'vaulted',
        draw_day: '2026-07-03',
      },
    ],
  };

  it('parses a full fixture (box + both voucher lists + ship_prizes)', () => {
    const parsed = parseOne(DailyStateSchema, fullFixture);
    expect(parsed).not.toBeNull();
    expect(parsed?.redemption_enabled).toBe(true);
    expect(parsed?.box).toMatchObject({ tier: 'a', draws_per_day: 3 });
    expect(parsed?.vouchers.claimable).toHaveLength(1);
    expect(parsed?.vouchers.claimed).toHaveLength(1);
    expect(parsed?.ship_prizes).toHaveLength(1);
    // level is a required top-level GrantView field (packs/service.ts:199-205),
    // not read from payload — assert it round-trips for both grant lists.
    expect(parsed?.vouchers.claimable[0]?.level).toBe(4);
    expect(parsed?.vouchers.claimed[0]?.level).toBe(2);
  });

  it('rejects the whole state when a voucher grant is missing level', () => {
    const badGrant = {
      id: 'grant_3',
      kind: 'voucher',
      payload: { amount_myr: 10 },
      granted_at: '2026-07-04T00:00:00.000Z',
    };
    const parsed = parseOne(DailyStateSchema, {
      ...fullFixture,
      vouchers: { claimable: [badGrant], claimed: [] },
    });
    expect(parsed).toBeNull();
  });

  it('tolerates box: null', () => {
    const parsed = parseOne(DailyStateSchema, { ...fullFixture, box: null });
    expect(parsed).not.toBeNull();
    expect(parsed?.box).toBeNull();
  });

  it('drops invalid shapes (missing redemption_enabled)', () => {
    const rest: Record<string, unknown> = { ...fullFixture };
    delete rest.redemption_enabled;
    expect(parseOne(DailyStateSchema, rest)).toBeNull();
  });
});

describe('DrawBoxSchema', () => {
  it("accepts kind: 'voucher'", () => {
    const parsed = parseOne(DrawBoxSchema, {
      status: 'drawn',
      prize: { kind: 'voucher', amount_myr: 10 },
      draw_ordinal: 1,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.prize?.kind).toBe('voucher');
  });

  it('still accepts the pre-existing kinds', () => {
    expect(
      parseOne(DrawBoxSchema, { status: 'drawn', prize: { kind: 'credit' } })
        ?.prize?.kind,
    ).toBe('credit');
    expect(parseOne(DrawBoxSchema, { status: 'capped' })?.status).toBe(
      'capped',
    );
  });

  it('rejects an unknown prize kind', () => {
    expect(
      parseOne(DrawBoxSchema, {
        status: 'drawn',
        prize: { kind: 'unobtainium' },
      }),
    ).toBeNull();
  });
});
