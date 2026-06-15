import type PacksModuleService from "./service";

/** @deprecated call `packs.creditBalance(customerId)` directly. Kept so existing
 *  callers/tests keep working while sites migrate to the service method. */
export async function creditBalance(
  packs: PacksModuleService,
  customerId: string
): Promise<number> {
  return packs.creditBalance(customerId);
}
