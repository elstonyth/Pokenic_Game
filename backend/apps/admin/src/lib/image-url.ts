// Card/pack `image` values come in two shapes:
//   - Seeded art = storefront-origin-relative paths (e.g. /cdn/cards/x.webp,
//     /home/hero/slabs/x.webp, /images/claw/x-icon.webp) served by the storefront.
//   - Admin uploads = absolute backend URLs (http://localhost:9000/static/...).
// The admin SPA runs on a different origin than the storefront, so a relative path
// resolves against the admin origin and 404s (Vite returns index.html -> broken
// image). Prefix relative paths with the storefront base so they render; leave
// absolute URLs untouched. RENDER-ONLY — never persist the resolved value.
//
// Override the base with VITE_STOREFRONT_URL; defaults to the local storefront.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> })
  .env;
const STOREFRONT_URL = (env?.VITE_STOREFRONT_URL || "http://localhost:4000").replace(
  /\/+$/,
  ""
);

export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${STOREFRONT_URL}${url}`;
  return url;
}
