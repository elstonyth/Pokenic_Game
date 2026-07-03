import type PacksModuleService from './service';

// A pack is openable only when its prize pool has at least one CARD odds row
// with positive weight — the exact precondition roll-pack's fetchPackData
// enforces at spin time. The activation guards (create/update pack,
// set-pack-members) check this BEFORE a pack can go/stay active, so a customer
// can never see a spinnable pack whose every spin would fail.
export async function hasRollablePool(
  packs: PacksModuleService,
  slug: string,
): Promise<boolean> {
  const odds = await packs.listPackOdds({ pack_id: slug }, { take: 1000 });
  return odds.some((o) => o.card_id != null && o.weight > 0);
}
