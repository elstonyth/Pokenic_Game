// Cut SnapGen frame-variant art into the EXACT SlabImage GlassFrame geometry
// (src/components/SlabImage.tsx is the source of truth: 1600×2740 frame box,
// 80px band, outer/hole radii 140/48 following the clear-plastic outline,
// hole inset 92) and composite each
// around the real slab asset. Outputs per-variant band PNGs (transparent
// hole — usable directly as a frame texture) + one combined preview sheet.
import sharp from 'sharp';

// ==== geometry, 1:1 with src/components/SlabImage.tsx ====
const SLAB_W = 1600;
const SLAB_H = 2867;
const SLAB_ASPECT = SLAB_W / SLAB_H;
const BAND_PCT = 5;
const VB_W = SLAB_W;
const VB_H = Math.round(
  (VB_W / SLAB_ASPECT) * (1 - 2 * (BAND_PCT / 100) * (1 - SLAB_ASPECT)),
);
const BAND_U = Math.round((BAND_PCT / 100) * VB_W); // 80
// Measured 2026-07-17 (alpha scan of the frame-v2 public/images/slab-frame.webp
// via scripts/measure-slab-margins.mjs): plastic edge insets 17/22/16/11 px in
// asset units → ~90-100 in frame units (well 5%, scale 0.9), corner radius
// ~50. The band must stop at the PLASTIC outline (tuck under its AA edge) — a
// large-radius hole dives under the clear corner and shows through it.
const OUTER_R = 140; // ≈ hole r (48) + band (80) + edge gap (12) — uniform corners
const HOLE_INSET = 92; // plastic edge ~95 (mean) − tuck
const HOLE_R = 48;
const FRAME_Y = Math.round((SLAB_H - VB_H) / 2); // vertical inset in the slab box

const rr = (x, y, w, h, r) => {
  const x1 = x + w;
  const y1 = y + h;
  return (
    `M${x + r},${y}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y + r}V${y1 - r}` +
    `A${r},${r} 0 0 1 ${x1 - r},${y1}H${x + r}A${r},${r} 0 0 1 ${x},${y1 - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`
  );
};

const MASK_SVG = Buffer.from(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VB_W} ${VB_H}' width='${VB_W}' height='${VB_H}'>` +
    `<path fill='white' fill-rule='evenodd' d='${rr(0, 0, VB_W, VB_H, OUTER_R)} ${rr(HOLE_INSET, HOLE_INSET, VB_W - 2 * HOLE_INSET, VB_H - 2 * HOLE_INSET, HOLE_R)}'/></svg>`,
);

// usage: node scripts/compose-frame-variant.mjs [--no-slab] [--from-guide]
//          [--sheet <name>] [name ...]
// names are docs/research/<name>.png; --no-slab previews the bare frame ring;
// --from-guide extracts the ring from its known rect on the 2:3 guide canvas
// (see --guide) instead of cover-cropping the whole image.
const args = process.argv.slice(2);
const NO_SLAB = args.includes('--no-slab');
const FROM_GUIDE = args.includes('--from-guide');
const sheetIdx = args.indexOf('--sheet');
const SHEET = sheetIdx !== -1 ? args[sheetIdx + 1] : 'frame-variants-sheet';
const VARIANTS = args.filter(
  (a, i) => !a.startsWith('--') && i !== sheetIdx + 1,
);

// --guide: emit the exact frame band as a WHITE ring centered on a 2:3
// canvas (a gpt-image aspect) → attach as a geometry reference so the model
// paints style into the true band instead of inventing its own thickness.
if (args.includes('--guide')) {
  const GW = 2000; // 2:3 canvas (the 1600×2740 frame box outgrew 1600×2400)
  const GH = 3000;
  const gx = Math.round((GW - VB_W) / 2);
  const gy = Math.round((GH - VB_H) / 2);
  await sharp(
    Buffer.from(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${GW}' height='${GH}'>` +
        `<rect width='${GW}' height='${GH}' fill='black'/>` +
        `<g transform='translate(${gx},${gy})'><path fill='white' fill-rule='evenodd' ` +
        `d='${rr(0, 0, VB_W, VB_H, OUTER_R)} ${rr(HOLE_INSET, HOLE_INSET, VB_W - 2 * HOLE_INSET, VB_H - 2 * HOLE_INSET, HOLE_R)}'/></g></svg>`,
    ),
  )
    .png()
    .toFile('docs/research/frame-guide.png');
  console.log(`done: docs/research/frame-guide.png (${GW}x${GH}, 2:3)`);
  process.exit(0);
}
if (!VARIANTS.length)
  VARIANTS.push(
    'frame-variant-1-molten-amber',
    'frame-variant-2-holo-prism',
    'frame-variant-3-crystal-facet',
    'frame-variant-4-smoked-neon',
  );

const mask = await sharp(MASK_SVG).png().toBuffer();
// contain (not fill) = what the CSS does; the frame-v2 asset shares the box
// aspect exactly, so no letterbox.
const slab = await sharp('public/images/slab-frame.webp')
  .resize(Math.round(SLAB_W * 0.9), Math.round(SLAB_H * 0.9), {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const previews = [];
for (const name of VARIANTS) {
  // --from-guide: the master is a black canvas with the painted ring on it —
  // find the ring's outer bbox by brightness scan and extract exactly that.
  // Self-calibrating: works for masters painted against the old 1600×2400
  // guide AND the current 2000×3000 one (the guide layout changed with the
  // frame-v2 geometry, but existing masters are still cut correctly).
  let src = sharp(`docs/research/${name}.png`);
  if (FROM_GUIDE) {
    const { data, info } = await src
      .clone()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mw = info.width,
      mh = info.height,
      mch = info.channels;
    const lit = (x, y) => {
      const i = (y * mw + x) * mch;
      return Math.max(data[i], data[i + 1], data[i + 2]) > 24;
    };
    let bx0 = mw,
      by0 = mh,
      bx1 = -1,
      by1 = -1;
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        if (lit(x, y)) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    if (bx1 < 0) throw new Error(`no painted ring found in ${name}.png`);
    src = src.extract({
      left: bx0,
      top: by0,
      width: bx1 - bx0 + 1,
      height: by1 - by0 + 1,
    });
  }
  const band = await src
    .resize(VB_W, VB_H, {
      fit: FROM_GUIDE ? 'fill' : 'cover',
      position: 'centre',
    })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  await sharp(band).toFile(`docs/research/${name}-band.png`);

  // preview: dark bg → band (at its vertical inset) → slab on top
  const preview = await sharp({
    create: {
      width: SLAB_W,
      height: SLAB_H,
      channels: 4,
      background: { r: 23, g: 23, b: 23, alpha: 1 },
    },
  })
    .composite([
      { input: band, left: 0, top: FRAME_Y },
      ...(NO_SLAB
        ? []
        : [
            {
              input: slab,
              left: Math.round(SLAB_W * 0.05),
              top: Math.round(SLAB_H * 0.05),
            },
          ]),
    ])
    .png()
    .toBuffer();
  previews.push(preview);
  await sharp(preview).toFile(`docs/research/${name}-preview.png`);
}

// combined sheet, N-up
const TH_W = 460;
const TH_H = Math.round(TH_W / SLAB_ASPECT);
const GAP = 24;
const sheet = sharp({
  create: {
    width: TH_W * VARIANTS.length + GAP * (VARIANTS.length + 1),
    height: TH_H + GAP * 2,
    channels: 4,
    background: { r: 23, g: 23, b: 23, alpha: 1 },
  },
});
const thumbs = await Promise.all(
  previews.map((p) => sharp(p).resize(TH_W, TH_H).png().toBuffer()),
);
await sheet
  .composite(
    thumbs.map((input, i) => ({
      input,
      left: GAP + i * (TH_W + GAP),
      top: GAP,
    })),
  )
  .png()
  .toFile(`docs/research/${SHEET}.png`);

console.log(
  `done: per-variant *-band.png (transparent hole) + docs/research/${SHEET}.png`,
);
