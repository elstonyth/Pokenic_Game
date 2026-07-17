// Ship the graded-slab default frame + print its measured geometry
// (window insets, label box, holo probe). The shipped webp is derived from
// the design session's operator-approved processed master.
//
// PROVENANCE / DEVIATION from the plan (2026-07-17): the plan transcribed a
// green-key + white-flood pipeline over docs/research/slabframe-snapgen-v2.png
// with v1-era thresholds (>=250 background flood, (242,242,244) case check,
// CASE_ALPHA 0.55). That transcription does not reproduce the session's
// approved output: v2's page background carries a soft contact shadow
// (~211-224 RGB) that the >=250 flood never removes — it ships as a gray halo
// over dark pages — and v2's case tone (175-220) makes the case-survival
// check throw. The session iterated past v2 (v3/v4 masters, 2026-07-16
// 22:46/23:09) and left its approved processed output on disk:
// docs/research/slabframe-final-1600.png — exact 1600x2867 (SLAB_ASPECT
// 0.5581), glassy case (uniform alpha 115 ≈ 0.45, flat 244 tone), fully
// opaque label, background keyed clean (verified 2026-07-17 by pixel-sampling
// a dark-page composite: background lands at the page color exactly).
// This script ships THAT file — no re-keying, zero threshold drift.
// NOTE: its measured window/label geometry deviates from the plan's recorded
// expectations (which were measured on an intermediate v2 processing):
// window left/right 0.1144/0.1169 vs plan 0.1069/0.1062; label top 0.0617 vs
// plan 0.0474. The printed values below are the shipped frame's real geometry
// — downstream constants (SLAB_WINDOW, Task 5 LABEL_BOX) must use these.
//
// FALLBACK (2026-07-17, committed so the shipped frame is regenerable if the
// local-only approved master is ever lost): --rebuild-from-master (or the
// automatic path when slabframe-final-1600.png is missing) reconstructs the
// approved master from the raw SnapGen render. Reverse-engineering the
// approved file showed its true lineage: the parent is slabframe-snapgen-v4
// (2160x3840, the session's last render — NOT v2; alignment NCC 0.72 vs 0.53),
// and its alpha mask is not a color key at all — the session's editor pass
// drew synthetic geometry: a feathered superellipse-cornered rounded-rect
// silhouette (case, alpha 115), a hard label rect (alpha 255, master RGB
// kept), and a hard window rect (alpha 0). The silhouette boundary sits in
// flat 253-vs-253 white and even runs darker OUTSIDE than inside on the right
// edge, so no flood/key threshold can reproduce it; the rebuild instead bakes
// the measured geometry (edges constant to ±0.001px over 2000+ rows) plus a
// linear case de-glare (flatten toward ~238). Calibration 2026-07-17: rebuilt
// webp vs shipped webp binary alpha-mask diff = 382 px (0.0083%), all of it
// corner-AA rounding + 110 stray semi-opaque pixels in the hand-made original
// (rows 15/795). RGB: label region byte-faithful to the master crop (flat-area
// MAD 1.8/channel); case within 6.7/channel at 45% opacity (~1% on-screen).
// Usage: node scripts/process-slabframe-v2.mjs [--rebuild-from-master]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const sharp = require(process.env.SHARP_PATH ?? 'sharp');

const SRC = path.join(
  here,
  '..',
  'docs',
  'research',
  'slabframe-final-1600.png',
);
const RAW = path.join(
  here,
  '..',
  'docs',
  'research',
  'slabframe-snapgen-v4.png',
);
const OUT = path.join(here, '..', 'public', 'images', 'slab-frame.webp');
const TARGET_W = 1600; // = MAX_FRAME_WIDTH in bake-slab.ts
const TARGET_H = 2867;

// ---- 0b. fallback: rebuild the approved master from the raw SnapGen render ----
// Every constant below was measured on the approved master (see header) and is
// frozen; do not re-derive from the raw render — the mask is synthetic geometry.
async function rebuildFromMaster() {
  if (!existsSync(RAW)) {
    throw new Error(
      `rebuild needs the raw SnapGen master at ${RAW} (local-only; ` +
        're-pull the SnapGen job or restore from backup)',
    );
  }
  const FW = TARGET_W,
    FH = TARGET_H;
  // crop of the raw render that maps onto the approved 1600x2867 canvas
  // (calibrated by minimizing label-region RGB MAD; lanczos3, fit:fill)
  const CROP = { left: 11, top: 2, width: 2148, height: 3830 };
  // silhouette rounded-rect: subpixel edge positions (measured, constant to
  // ±0.001px) + per-corner superellipse (|dx/r|^n + |dy/r|^n = 1)
  const EDGE = { L: 16.5236, R: 1577.3681, T: 15.8712, B: 2855.3883 };
  const CORNER = {
    TL: { r: 72.0, n: 2.3 },
    TR: { r: 68.5, n: 1.95 },
    BL: { r: 63.5, n: 2.15 },
    BR: { r: 66.0, n: 2.15 },
  };
  // feathered edge profiles: [signed distance to edge (px, + = inside), alpha]
  // knots measured per straight edge; piecewise-linear between knots. The
  // sub-8-alpha zigzags (stray 1-3 alpha lines) are faithful to the original.
  const RAMP = {
    L: [
      [-1.52, 0],
      [-0.52, 2],
      [0.48, 108],
      [1.48, 115],
    ],
    R: [
      [-2.63, 0],
      [-1.63, 2],
      [-0.63, 0],
      [0.37, 91],
      [1.37, 115],
    ],
    T: [
      [-2.87, 0],
      [-1.87, 3],
      [-0.87, 0],
      [0.13, 66],
      [1.13, 115],
    ],
    B: [
      [-2.61, 0],
      [-1.61, 1],
      [-0.61, 0],
      [0.39, 94],
      [1.39, 115],
    ],
  };
  const LABEL = { x0: 93, y0: 113, x1: 1498, y1: 588 }; // hard rect, alpha 255
  const WINDOW = { x0: 183, y0: 795, x1: 1412, y1: 2647 }; // hard rect, alpha 0
  // case de-glare: flatten gray toward ~238 (final ≈ 0.43*raw + 135.15),
  // applied as a per-pixel gray-ratio scale so hue is preserved; label exempt
  const TONE = { a: 0.43, b: 135.15 };

  const rgb = await sharp(RAW)
    .extract(CROP)
    .removeAlpha()
    .resize(FW, FH, { fit: 'fill' })
    .raw()
    .toBuffer();

  const evalRamp = (pts, d) => {
    if (d <= pts[0][0]) return pts[0][1];
    if (d >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (d <= pts[i][0]) {
        const [d0, a0] = pts[i - 1],
          [d1, a1] = pts[i];
        return a0 + ((a1 - a0) * (d - d0)) / (d1 - d0);
      }
    }
    return pts[pts.length - 1][1];
  };
  const C = {
    TL: { cx: EDGE.L + CORNER.TL.r, cy: EDGE.T + CORNER.TL.r, ...CORNER.TL },
    TR: { cx: EDGE.R - CORNER.TR.r, cy: EDGE.T + CORNER.TR.r, ...CORNER.TR },
    BL: { cx: EDGE.L + CORNER.BL.r, cy: EDGE.B - CORNER.BL.r, ...CORNER.BL },
    BR: { cx: EDGE.R - CORNER.BR.r, cy: EDGE.B - CORNER.BR.r, ...CORNER.BR },
  };
  const out = Buffer.alloc(FW * FH * 4);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const p = y * FW + x;
      // silhouette alpha: corner superellipse SDF or min of straight edges
      let c = null,
        qdx = 0,
        qdy = 0;
      if (x < C.TL.cx && y < C.TL.cy) {
        c = C.TL;
        qdx = C.TL.cx - x;
        qdy = C.TL.cy - y;
      } else if (x > C.TR.cx && y < C.TR.cy) {
        c = C.TR;
        qdx = x - C.TR.cx;
        qdy = C.TR.cy - y;
      } else if (x < C.BL.cx && y > C.BL.cy) {
        c = C.BL;
        qdx = C.BL.cx - x;
        qdy = y - C.BL.cy;
      } else if (x > C.BR.cx && y > C.BR.cy) {
        c = C.BR;
        qdx = x - C.BR.cx;
        qdy = y - C.BR.cy;
      }
      let a;
      if (c) {
        const v = Math.pow(
          Math.pow(qdx / c.r, c.n) + Math.pow(qdy / c.r, c.n),
          1 / c.n,
        );
        const d = (1 - v) * c.r;
        const wx = qdx / (qdx + qdy + 1e-9),
          wy = 1 - wx;
        const rx = c === C.TL || c === C.BL ? RAMP.L : RAMP.R;
        const ry = c === C.TL || c === C.TR ? RAMP.T : RAMP.B;
        a = wx * evalRamp(rx, d) + wy * evalRamp(ry, d);
      } else {
        a = Math.min(
          evalRamp(RAMP.L, x - EDGE.L),
          evalRamp(RAMP.R, EDGE.R - x),
          evalRamp(RAMP.T, y - EDGE.T),
          evalRamp(RAMP.B, EDGE.B - y),
        );
      }
      if (x >= WINDOW.x0 && x <= WINDOW.x1 && y >= WINDOW.y0 && y <= WINDOW.y1)
        a = 0;
      const inLabel =
        x >= LABEL.x0 && x <= LABEL.x1 && y >= LABEL.y0 && y <= LABEL.y1;
      if (inLabel) a = 255;
      let rr = rgb[p * 3],
        gg = rgb[p * 3 + 1],
        bb = rgb[p * 3 + 2];
      if (!inLabel) {
        const g0 = (rr + gg + bb) / 3;
        const k = g0 > 1 ? (TONE.a * g0 + TONE.b) / g0 : 1;
        rr = Math.max(0, Math.min(255, Math.round(rr * k)));
        gg = Math.max(0, Math.min(255, Math.round(gg * k)));
        bb = Math.max(0, Math.min(255, Math.round(bb * k)));
      }
      const i = p * 4;
      out[i] = rr;
      out[i + 1] = gg;
      out[i + 2] = bb;
      out[i + 3] = Math.round(a);
    }
  }
  return {
    data: out,
    info: { width: FW, height: FH, channels: 4 },
  };
}

const REBUILD =
  process.argv.includes('--rebuild-from-master') || !existsSync(SRC);
if (REBUILD) {
  console.log(
    existsSync(SRC)
      ? 'rebuild requested — reconstructing from the raw SnapGen master'
      : `approved master missing (${SRC}) — falling back to rebuild from the raw SnapGen master`,
  );
} else {
  readFileSync(SRC); // fail fast if unreadable
}

// ---- 1. load + sanity-check the (approved or rebuilt) master ----
const { data, info } = REBUILD
  ? await rebuildFromMaster()
  : await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width,
  H = info.height,
  CH = info.channels;
if (W !== TARGET_W || H !== TARGET_H) {
  throw new Error(`expected the approved 1600x2867 master, got ${W}x${H}`);
}
// border ring must be fully transparent (no background halo)
for (let x = 0; x < W; x++) {
  if (data[x * CH + 3] > 8 || data[((H - 1) * W + x) * CH + 3] > 8) {
    throw new Error(
      `opaque background pixel on the top/bottom border at x=${x}`,
    );
  }
}
for (let y = 0; y < H; y++) {
  if (data[y * W * CH + 3] > 8 || data[(y * W + W - 1) * CH + 3] > 8) {
    throw new Error(
      `opaque background pixel on the left/right border at y=${y}`,
    );
  }
}
// glassy case body present (uniform ~alpha 115) and opaque label present
let glassPx = 0,
  opaquePx = 0;
for (let p = 0; p < W * H; p++) {
  const a = data[p * CH + 3];
  if (a > 100 && a < 130) glassPx++;
  else if (a > 240) opaquePx++;
}
if (glassPx < W * H * 0.1) {
  throw new Error(`glassy case body missing: only ${glassPx} px at alpha~115`);
}
if (opaquePx < W * H * 0.05) {
  throw new Error(`opaque label region missing: only ${opaquePx} px`);
}
console.log(
  'glassy-case pixels:',
  glassPx,
  `(${((glassPx / (W * H)) * 100).toFixed(1)}%)`,
  ' opaque(label) pixels:',
  opaquePx,
  `(${((opaquePx / (W * H)) * 100).toFixed(1)}%)`,
);

// ---- 2. ship ----
// When rebuilding and a committed webp already exists, gate on it first: the
// rebuild must reproduce the shipped alpha mask (0.0083% at calibration time).
if (REBUILD && existsSync(OUT)) {
  const prev = await sharp(OUT).ensureAlpha().raw().toBuffer();
  let mismatch = 0;
  for (let p = 0; p < W * H; p++) {
    if (data[p * CH + 3] <= 8 !== prev[p * 4 + 3] <= 8) mismatch++;
  }
  console.log(
    'rebuild alpha-mask diff vs committed webp:',
    mismatch,
    `(${((mismatch / (W * H)) * 100).toFixed(4)}%)`,
  );
  if (mismatch > W * H * 0.0005) {
    throw new Error(
      'rebuilt mask deviates from the shipped frame beyond 0.05% — the raw ' +
        'master or the frozen constants no longer match; do not ship',
    );
  }
}
await sharp(data, { raw: { width: W, height: H, channels: CH } })
  .webp({ quality: 90, alphaQuality: 90 })
  .toFile(OUT);

// ---- 3. verify the webp encode kept the alpha mask (transparent-vs-not) ----
{
  const { data: D2 } = await sharp(OUT)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let mismatch = 0;
  for (let p = 0; p < W * H; p++) {
    if (data[p * CH + 3] <= 8 !== D2[p * CH + 3] <= 8) mismatch++;
  }
  console.log(
    'webp alpha-mask mismatch vs master:',
    mismatch,
    `(${((mismatch / (W * H)) * 100).toFixed(4)}%)`,
  );
  if (mismatch > W * H * 0.003) {
    throw new Error('webp encode perturbed the alpha mask beyond tolerance');
  }
}

// ---- 4. measure the shipped frame (never eyeball — §5) ----
const { data: D, info: I } = await sharp(OUT)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const w = I.width,
  h = I.height,
  ch = I.channels;
const A = (x, y) => D[(y * w + x) * ch + 3];
const RGB = (x, y) => {
  const i = (y * w + x) * ch;
  return [D[i], D[i + 1], D[i + 2]];
};
// exterior flood (transparent + border-connected), then window = interior transparent bbox
const ext = new Uint8Array(w * h);
const st = [];
for (let x = 0; x < w; x++) st.push(x, 0, x, h - 1);
for (let y = 0; y < h; y++) st.push(0, y, w - 1, y);
while (st.length) {
  const y = st.pop(),
    x = st.pop();
  if (x < 0 || y < 0 || x >= w || y >= h) continue;
  const p = y * w + x;
  if (ext[p] || A(x, y) > 8) continue;
  ext[p] = 1;
  st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
let wx0 = w,
  wy0 = h,
  wx1 = -1,
  wy1 = -1;
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    if (A(x, y) <= 8 && !ext[y * w + x]) {
      if (x < wx0) wx0 = x;
      if (x > wx1) wx1 = x;
      if (y < wy0) wy0 = y;
      if (y > wy1) wy1 = y;
    }
  }
console.log('frame', `${w}x${h}`, 'SLAB_ASPECT', (w / h).toFixed(4));
console.log(
  'SLAB_WINDOW  top',
  (wy0 / h).toFixed(4),
  ' left',
  (wx0 / w).toFixed(4),
  ' right',
  ((w - 1 - wx1) / w).toFixed(4),
  ' bottom',
  ((h - 1 - wy1) / h).toFixed(4),
  ' window aspect',
  ((wx1 - wx0) / (wy1 - wy0)).toFixed(4),
);
// label = the WHITE STICKER inside the red border, top 20% of the frame.
// NOT the red outer bbox: all text constants are fractions of the sticker
// (measured 2026-07-16 on 4 real cert labels incl. cert 152108321 — the same
// Pikachu ex #238; using the red bbox pushed the right column outside the
// label). Off-centre scanlines so neither the border's rounded corners nor
// the centred PSA logo can truncate the walk.
const isRedAt = (x, y) => {
  const [r, g, b] = RGB(x, y);
  return A(x, y) > 200 && r > 140 && g < 90 && b < 90;
};
let lx0 = w,
  ly0 = h,
  lx1 = -1,
  ly1 = -1;
for (let y = 0; y < Math.floor(h * 0.2); y++)
  for (let x = 0; x < w; x++) {
    if (isRedAt(x, y)) {
      if (x < lx0) lx0 = x;
      if (x > lx1) lx1 = x;
      if (y < ly0) ly0 = y;
      if (y > ly1) ly1 = y;
    }
  }
const rowY = Math.round(ly0 + (ly1 - ly0) * 0.3); // crosses text at worst, never the logo
let sx0 = Math.round((lx0 + lx1) / 2);
while (sx0 > lx0 && !isRedAt(sx0 - 1, rowY)) sx0--;
let sx1 = Math.round((lx0 + lx1) / 2);
while (sx1 < lx1 && !isRedAt(sx1 + 1, rowY)) sx1++;
const colX = Math.round(lx0 + (lx1 - lx0) * 0.15); // left of the centred PSA logo
let sy0 = Math.round((ly0 + ly1) / 2);
while (sy0 > ly0 && !isRedAt(colX, sy0 - 1)) sy0--;
let sy1 = Math.round((ly0 + ly1) / 2);
while (sy1 < ly1 && !isRedAt(colX, sy1 + 1)) sy1++;
const STICKER = { x: sx0, y: sy0, w: sx1 - sx0 + 1, h: sy1 - sy0 + 1 };
console.log(
  'LABEL_BOX (white sticker)  top',
  (STICKER.y / h).toFixed(4),
  ' left',
  (STICKER.x / w).toFixed(4),
  ' right',
  ((w - STICKER.x - STICKER.w) / w).toFixed(4),
  ' height',
  (STICKER.h / h).toFixed(4),
);
// holo probe: the frame's baked-in PSA logo — dark ink bands inside the
// sticker (§13; text rows must stay above its top edge)
let hy0 = -1;
for (let y = sy0 + Math.floor(STICKER.h * 0.5); y <= sy1 && hy0 < 0; y++) {
  for (let x = sx0 + 3; x < sx1 - 3; x++) {
    const [r, g, b] = RGB(x, y);
    if (A(x, y) > 200 && Math.max(r, g, b) < 190) {
      hy0 = y;
      break;
    }
  }
}
if (hy0 >= 0) {
  console.log(
    'HOLO/logo top  frac-of-sticker',
    ((hy0 - sy0) / STICKER.h).toFixed(3),
    '(text baseline 3 sits at 0.723 — must be ABOVE this)',
  );
} else {
  console.log(
    'HOLO probe: no logo ink found in the sticker bottom half — inspect manually',
  );
}
