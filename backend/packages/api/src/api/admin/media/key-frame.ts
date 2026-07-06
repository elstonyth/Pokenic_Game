import sharp from 'sharp';

// Server-side chroma-key for slab-frame uploads: the admin "AI prompt
// templates" produce renders with a flat #FF00FF magenta card window +
// background. This turns that magenta into transparency and crops to the
// slab, so an operator can paste a template into any image model and upload
// the result directly — no manual editing.
//
// Port of scripts/process-slab-frame.mjs (which produced the bundled default
// frame). Keying is magenta-ness based (min(R,B) − G), NOT global
// color-to-alpha: AI renders carry grain, and color-to-alpha also unmixes
// magenta out of legitimately opaque art (it turned a gold label green).
// Non-magenta pixels keep their exact bytes (minus despill).

// RELATIVE keyness → alpha ramp: models don't render #FF00FF faithfully
// (observed keys range from excess ≈255 down to ≈130 on a dull purple-magenta
// render), so the ramp normalizes each pixel's magenta excess by the render's
// OWN sampled key strength. Opaque at ≤ K0×key, transparent at ≥ K1×key.
const K0 = 0.3;
const K1 = 0.75;
// A pixel counts as magenta-hued at all when its excess clears this floor.
const MIN_EXCESS = 60;
// …and the render counts as chroma-keyed when ≥12% of pixels do (the
// templates' window+background always exceed this; purple-tinted frame ART
// stays below it).
const MIN_FRACTION = 0.12;
const OUT_WIDTH = 800;

/**
 * Detect a chroma-keyed render and measure its key strength: the mean
 * magenta excess (min(R,B) − G) of all magenta-hued pixels. Returns null
 * when the image is not chroma-keyed.
 */
export function sampleKeyStrength(
  data: Buffer,
  channels: number,
  sampleStride = 7,
): number | null {
  let magenta = 0;
  let total = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += channels * sampleStride) {
    total++;
    const excess = Math.min(data[i], data[i + 2]) - data[i + 1];
    if (excess > MIN_EXCESS) {
      magenta++;
      sum += excess;
    }
  }
  if (total === 0 || magenta / total < MIN_FRACTION) return null;
  return sum / magenta;
}

/**
 * Key out the magenta, despill, clean speckles, crop to the slab's bounding
 * box, and resize to the storefront's frame width. Returns null when the
 * image is NOT a magenta render (already-transparent frames pass through
 * untouched by the caller).
 */
export async function keyMagentaFrame(input: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const keyStrength = sampleKeyStrength(data, 4);
  if (keyStrength === null) return null;

  // 1 — alpha from RELATIVE magenta-ness + despill (excess magenta → neutral
  // grey so semi-transparent plastic doesn't go pink).
  const alpha = new Float32Array(W * H);
  for (let n = 0; n < W * H; n++) {
    const i = n * 4;
    const excess = Math.min(data[i], data[i + 2]) - data[i + 1];
    const k = Math.max(0, excess) / keyStrength;
    alpha[n] = k >= K1 ? 0 : k <= K0 ? 1 : (K1 - k) / (K1 - K0);
    if (excess > 0) {
      data[i] -= excess;
      data[i + 2] -= excess;
    }
  }

  // 2 — speckle cleanup: kill semi-opaque grain dots whose 5×5 neighbourhood
  // is mostly transparent; coherent slab regions are unaffected.
  const cleaned = new Float32Array(alpha);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = y * W + x;
      if (alpha[n] === 0 || alpha[n] >= 0.85) continue;
      let sum = 0;
      let cnt = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          sum += alpha[yy * W + xx];
          cnt++;
        }
      if (sum / cnt < 0.25) cleaned[n] = 0;
    }
  for (let n = 0; n < W * H; n++)
    data[n * 4 + 3] = Math.round(cleaned[n] * data[n * 4 + 3]);

  // 3 — crop to the slab bounding box (alpha ≥ 25) and emit the final asset.
  let sl = W,
    sr = 0,
    st = H,
    sb = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] >= 25) {
        if (x < sl) sl = x;
        if (x > sr) sr = x;
        if (y < st) st = y;
        if (y > sb) sb = y;
      }
  if (sr <= sl || sb <= st) return null; // keyed everything — not a frame

  return sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: sl, top: st, width: sr - sl + 1, height: sb - st + 1 })
    .resize({ width: OUT_WIDTH })
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();
}
