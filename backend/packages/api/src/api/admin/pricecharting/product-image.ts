// Resolve a PriceCharting product's card photo.
//
// PriceCharting's *price* API (/api/product) returns NO image — verified live:
// every product comes back with image=null. The photo only lives on the public
// product page, so we scrape it from …/offers?product=<id> (a public page, no
// token needed) and hand the URL back to the admin so picking a card fills the
// image by itself. The create-from-PC step then ingests that URL through the
// media pipeline (our own stored copy, never a hotlink).
//
// Best-effort by design: any failure returns null so the caller (the product
// price route) never breaks — the operator can always paste/upload manually.

import {
  PC_IMAGE_HOST,
  PC_IMAGE_PATH_PREFIX,
} from '../media/ingest-pc-image';

const OFFERS_URL = 'https://www.pricecharting.com/offers';
const TIMEOUT_MS = 10_000;

// The card photo on PriceCharting's public GCS bucket, e.g.
// …/images.pricecharting.com/<hash>/240.jpg. Built from the SAME host +
// bucket-prefix constants ingest-pc-image.ts guards on, so the finder here can
// never drift from the SSRF allowlist that ultimately validates the URL. The
// hash segment is any run of non-separator chars; the size is digits + ".jpg".
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GCS_IMAGE_RE = new RegExp(
  `https://${escapeRe(PC_IMAGE_HOST)}${escapeRe(PC_IMAGE_PATH_PREFIX)}[^/"'\\s]+/\\d+\\.jpg`,
  'i',
);

// Pull the first PriceCharting card photo out of an offers-page HTML body and
// normalize its size to /240.jpg. The offers page renders the product's own
// photo first (before any marketplace-listing thumbnails), so first-match is
// the canonical image. Normalizing to /240.jpg lets ingest-pc-image's
// 240→1600 bump fetch the full-res copy (falling back to 240 when PC has no
// 1600 variant). Exported for unit testing.
export function extractPcImageUrl(html: string): string | null {
  const match = html.match(GCS_IMAGE_RE)?.[0];
  if (!match) return null;
  return match.replace(/\/\d+\.jpg$/i, '/240.jpg');
}

export async function resolvePcImageUrl(
  productId: string,
): Promise<string | null> {
  const id = productId.trim();
  // PriceCharting product ids are numeric; anything else is not a real id and
  // keeps the scraped URL free of injected path/query segments.
  if (!/^\d+$/.test(id)) return null;

  let html: string;
  try {
    const resp = await fetch(`${OFFERS_URL}?product=${id}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Pokenic/1.0)' },
    });
    if (!resp.ok) return null;
    html = await resp.text();
  } catch {
    return null;
  }
  return extractPcImageUrl(html);
}
