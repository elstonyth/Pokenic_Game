import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { rewardsRedemptionEnabled } from '../../../modules/packs/rewards-gate';

// GET /store/rewards — the logged-in customer's reward-economy state in one read:
//   - grants:         claimable VIP reward grants (status 'granted'), newest first.
//   - draw_state:     today's draw progress + pool config so the UI can render the
//                     box section without a second call.
//   - prizes:         vaulted reward Pulls (source='reward') with prize metadata.
//   - redemption_enabled: mirrors REWARDS_REDEMPTION_ENABLED so the client can
//                     pre-disable Claim/Draw buttons before hitting a 403.
//
// AUTH + RATE LIMIT: registered in api/middlewares.ts (authenticate() then the
// store-read limiter). The customer id comes ONLY from the verified bearer token,
// so a caller can never read another customer's rewards.
const GRANT_LIMIT = 200;
const PRIZE_LIMIT = 500;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context?.actor_id;
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Unauthorized');
  }

  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const drawDay = new Date().toISOString().slice(0, 10);

  const [grantRows, todaysDraws, rewardPulls, stateRow] = await Promise.all([
    packs.listVipRewardGrants(
      { customer_id: customerId, status: 'granted' },
      // Newest first by grant time. level DESC put a high-level frame above a
      // just-granted low-level voucher, which reads as out-of-order in the UI.
      { order: { created_at: 'DESC' }, take: GRANT_LIMIT },
    ),
    packs.listRewardDraws(
      { customer_id: customerId, draw_day: drawDay },
      { take: 1000 },
    ),
    packs.listPulls(
      { customer_id: customerId, status: 'vaulted', source: 'reward' },
      { order: { rolled_at: 'DESC' }, take: PRIZE_LIMIT },
    ),
    packs
      .listVipMemberStates({ customer_id: customerId }, { take: 1 })
      .then(([row]) => row ?? null),
  ]);

  // Fix (1): `granted_at` was missing — storefront RewardGrantSchema requires it.
  const grants = grantRows.map((g) => ({
    id: g.id,
    level: g.level,
    kind: g.kind as string,
    payload: g.payload,
    status: g.status as string,
    granted_at: g.created_at.toISOString(),
  }));

  // Draw state: resolve the customer's tier so the UI can show draws_per_day and
  // whether the pool is enabled without waiting for a draw attempt.
  // Fix (2): key renamed draw → draw_state; missing fields added.
  let draw_state: {
    draws_today: number;
    draws_per_day: number;
    pool_enabled: boolean;
    tier: string;
  } | null = null;

  const level = stateRow ? Number(stateRow.highest_level_ever) : 1;
  const [vipLevel] = await packs.listVipLevels({ level }, { take: 1 });
  const tier = (vipLevel?.box_tier as string) ?? '';

  if (tier) {
    // Inline the same slug lookup as service.resolveRewardBoxPack (private).
    const prefix = `reward-box-${tier}`;
    const rewardPacks = await packs.listPacks(
      { category: 'reward_box' },
      { take: 1000 },
    );
    // Exact slug first, suffixed variant only as fallback (mirrors
    // service.resolveRewardBoxPack) — a suffixed pack must not shadow the
    // canonical one.
    const pack =
      rewardPacks.find((p) => p.slug === prefix) ??
      rewardPacks.find((p) => p.slug.startsWith(`${prefix}-`));
    draw_state = {
      draws_today: todaysDraws.length,
      draws_per_day: pack ? (pack.draws_per_day as number) : 0,
      pool_enabled: pack ? Boolean(pack.pool_enabled) : false,
      tier,
    };
  } else {
    draw_state = {
      draws_today: todaysDraws.length,
      draws_per_day: 0,
      pool_enabled: false,
      tier: '',
    };
  }

  // Vaulted reward prizes, rendered from prize_snapshot (no Card row exists for a
  // reward Pull). Batch-load the matching reward_draw rows keyed by vault_pull_id.
  const pullIds = rewardPulls.map((p) => p.id);
  const drawRows = pullIds.length
    ? await packs.listRewardDraws(
        { vault_pull_id: pullIds },
        { take: pullIds.length },
      )
    : [];
  const drawByPullId = new Map(drawRows.map((d) => [d.vault_pull_id, d]));

  // prizes emit prize_kind/prize_snapshot/draw_day from the reward_draw, but the
  // STATUS must reflect the PULL's real lifecycle (the storefront filters the
  // shippable list on status === 'vaulted'). reward_draw.status is only
  // 'drawn'/'voided', so emitting it left the shippable list permanently empty.
  // rewardPulls is already filtered to status:'vaulted', so every product prize
  // here reports 'vaulted'; a withdrawn prize (Pull flipped to 'delivering') drops
  // out of that query and is excluded from the list entirely.
  const prizes = rewardPulls
    .map((p) => {
      const d = drawByPullId.get(p.id);
      if (!d) return null;
      return {
        pull_id: p.id,
        prize_kind: d.prize_kind as string,
        prize_snapshot: d.prize_snapshot,
        status: p.status as string,
        draw_day: d.draw_day as string,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Fix (5): surface the gate flag so the client can pre-disable Claim/Draw.
  res.json({
    grants,
    draw_state,
    prizes,
    redemption_enabled: rewardsRedemptionEnabled(),
  });
}
