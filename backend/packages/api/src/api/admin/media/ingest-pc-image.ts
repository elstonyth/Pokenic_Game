import path from 'path';
import type { MedusaContainer } from '@medusajs/framework/types';
import { MedusaError } from '@medusajs/framework/utils';
import { uploadFilesWorkflow } from '@medusajs/medusa/core-flows';
import sharp from 'sharp';
import { IMAGE_RULES, validateImage } from './validate';

// Server-side ingest of a PriceCharting product photo: fetch it from PC's
// public GCS bucket, run it through the same validation gate as an admin
// upload (with the size-relaxed 'pc-card' profile), and store the bytes via
// the configured file provider — the product then serves OUR copy, never a
// hotlink that PC could break or swap.

// SSRF guard: the ONLY host this fetches from. The URL comes from the admin
// browser (prefilled off the /admin/pricecharting/product proxy), so treat it
// as untrusted input. Exported as the single source of truth for the host +
// bucket allowlist — the offers-page scraper (../pricecharting/product-image)
// builds its find-regex from these so the two can't drift.
export const PC_IMAGE_HOST = 'storage.googleapis.com';
export const PC_IMAGE_PATH_PREFIX = '/images.pricecharting.com/';

const FETCH_TIMEOUT_MS = 10_000;

// sharp's sniffed format → MIME for storage. PC serves JPEGs today; the rest
// mirror the /admin/media allowlist in case that ever changes.
const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/avif',
  avif: 'image/avif',
  gif: 'image/gif',
};

export function isPcImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === PC_IMAGE_HOST &&
    parsed.pathname.startsWith(PC_IMAGE_PATH_PREFIX)
  );
}

const badImage = (reason: string): never => {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `PriceCharting image could not be attached (${reason}) — upload the card image manually instead.`,
  );
};

const fetchBytes = async (url: string): Promise<Buffer | null> => {
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  const bytes = Buffer.from(await resp.arrayBuffer());
  return bytes.length > 0 ? bytes : null;
};

// Ingest the PC image behind `url` and return the stored (served) URL.
// Prefers the 1600.jpg size variant over the API's default 240.jpg — PC caps
// it at the source resolution, so it's the best copy they have.
export async function ingestPcImage(
  container: MedusaContainer,
  url: string,
): Promise<string> {
  if (!isPcImageUrl(url)) {
    badImage('not a PriceCharting image URL');
  }

  const bigger = url.replace(/\/240\.jpg$/, '/1600.jpg');
  const candidates = bigger !== url ? [bigger, url] : [url];

  let bytes: Buffer | null = null;
  let sourceUrl = url;
  for (const candidate of candidates) {
    bytes = await fetchBytes(candidate);
    if (bytes) {
      sourceUrl = candidate;
      break;
    }
  }
  if (!bytes) {
    badImage('image could not be downloaded');
    return ''; // unreachable — badImage throws; keeps TS narrow on `bytes`
  }

  // Byte cap BEFORE handing anything to sharp (multer does this for uploads).
  if (bytes.length > IMAGE_RULES.maxBytes) {
    badImage('file exceeds the size limit');
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return badImage('not a readable image');
  }

  const mimeType = FORMAT_TO_MIME[meta.format ?? ''] ?? '';
  const verdict = validateImage(
    {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      bytes: bytes.length,
      mimeType,
      detectedFormat: meta.format,
      frames: meta.pages ?? 1,
    },
    'pc-card',
  );
  if (!verdict.ok) {
    badImage(verdict.message);
  }

  // Filename keyed by PC's content hash (the path segment before the size),
  // so re-ingesting the same card is at least recognizable in storage.
  const segments = new URL(sourceUrl).pathname.split('/').filter(Boolean);
  const hash = segments.length >= 2 ? segments[segments.length - 2] : 'unknown';
  const filename = `pc-${hash}-${path.basename(new URL(sourceUrl).pathname)}`;

  const { result } = await uploadFilesWorkflow(container).run({
    input: {
      files: [
        {
          filename,
          mimeType,
          content: bytes.toString('base64'),
          access: 'public',
        },
      ],
    },
  });

  const stored = result?.[0]?.url;
  if (!stored) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      'Upload returned no file URL.',
    );
  }
  return stored;
}
