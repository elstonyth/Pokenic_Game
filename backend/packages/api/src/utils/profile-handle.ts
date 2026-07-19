// Public-profile handle derivation. A handle is the customer's stable,
// PII-free URL identity (e.g. "kenji-2c7f"), stored in customer
// metadata.handle and looked up by GET /store/profiles/:handle.
//
// Derivation is DETERMINISTIC (slug of display name + base36 hash of the
// customer id) so the seed script and the ensure-handle workflow agree on the
// same handle for the same customer across re-runs. The `attempt` counter is
// folded into the hash input so collision retries stay deterministic too.

const SLUG_MAX = 40;
const SUFFIX_LEN = 4;

/** Accepted handle shape — also the route-param gate (3..60 kebab chars). */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/;

/**
 * Deterministic string hash — the SAME function as the leaderboard's avatar
 * seed (`seedOf` in store/leaderboard/route.ts), exported here so the public
 * profile shows the identical avatar for the identical customer.
 */
export function seedOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Lowercased kebab slug of a display name; non-latin or empty input falls
 * back to "collector" so every customer gets a workable handle.
 */
export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'collector';
}

/**
 * PII-safe public display fields for a ranked customer, shared by the store
 * leaderboard and the challenge top-N (both are public and must NEVER leak
 * email/id): a display name (first_name, else an anonymous "Collector ####"
 * from the seed), the public handle if metadata carries a valid one, and the
 * equipped avatar url if set. `customer` is undefined when the id resolved to
 * no customer record. Callers append surface-specific fields (points, volume,
 * equipped_frame_level, …) themselves.
 */
export function publicProfileFields(
  customer:
    | { first_name?: string | null; metadata?: Record<string, unknown> | null }
    | undefined,
  seed: number,
): { name: string; handle: string | null; avatarUrl: string | null } {
  const first = (customer?.first_name || '').trim();
  const meta = (customer?.metadata ?? {}) as Record<string, unknown>;
  const handle = meta['handle'];
  const avatarUrl = meta['avatar_url'];
  return {
    name: first.length > 0 ? first : `Collector ${String(seed).slice(0, 4)}`,
    handle:
      typeof handle === 'string' && HANDLE_RE.test(handle) ? handle : null,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
  };
}

/**
 * The customer's derived handle: `<name-slug>-<base36 id hash>`. Increment
 * `attempt` on a uniqueness collision to get the next deterministic candidate.
 */
export function deriveHandle(
  firstName: string | null | undefined,
  customerId: string,
  attempt = 0,
): string {
  const slug = slugifyName(firstName ?? '');
  const input = attempt === 0 ? customerId : `${customerId}#${attempt}`;
  const suffix = seedOf(input)
    .toString(36)
    .padStart(SUFFIX_LEN, '0')
    .slice(-SUFFIX_LEN);
  return `${slug}-${suffix}`;
}
