// Cut SnapGen frame-variant art into the EXACT SlabImage GlassFrame geometry
// (src/components/SlabImage.tsx is the source of truth: 1462×2348 frame box,
// 73px band, outer/hole radii 127/47 following the clear-plastic outline,
// hole inset 79) and composite each
// around the real slab asset. Outputs per-variant band PNGs (transparent
// hole — usable directly as a frame texture) + one combined preview sheet.
import sharp from 'sharp';

// ==== geometry, 1:1 with src/components/SlabImage.tsx ====
const SLAB_W = 1462;
const SLAB_H = 2446;
const SLAB_ASPECT = SLAB_W / SLAB_H;
const BAND_PCT = 5;
const VB_W = SLAB_W;
const VB_H = Math.round(
  (VB_W / SLAB_ASPECT) * (1 - 2 * (BAND_PCT / 100) * (1 - SLAB_ASPECT)),
);
const BAND_U = Math.round((BAND_PCT / 100) * VB_W); // 73
// Measured 2026-07-17 (alpha scan of slabframe-user-1600): the slab's CLEAR
// plastic outline runs nearly to the image corner with a SMALL radius (~49px
// in frame units, edge at inset ~81 incl. letterbox); the big r~260 silver
// arc is a printed rail INSIDE the clear plastic. The band must stop at the
// PLASTIC outline (tuck ~2-4px under its thin clear edge) — a large-radius
// hole dives under the clear corner and shows through it.
const OUTER_R = 127; // ≈ plastic corner (49) + band (73) — uniform at corners
const HOLE_INSET = 79; // plastic edge ~81 − 2px tuck
const HOLE_R = 47;
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
  const GW = 1600; // 2:3 canvas
  const GH = 2400;
  const gx = Math.round((GW - 1462) / 2);
  const gy = Math.round((GH - 2348) / 2);
  await sharp(
    Buffer.from(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${GW}' height='${GH}'>` +
        `<rect width='${GW}' height='${GH}' fill='black'/>` +
        `<g transform='translate(${gx},${gy})'><path fill='white' fill-rule='evenodd' ` +
        `d='${rr(0, 0, 1462, 2348, 127)} ${rr(79, 79, 1462 - 158, 2348 - 158, 47)}'/></g></svg>`,
    ),
  )
    .png()
    .toFile('docs/research/frame-guide.png');
  console.log('done: docs/research/frame-guide.png (1600x2400, 2:3)');
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
// contain (not fill) = what the CSS does; the asset is 0.5926 vs the 0.5977
// box, so ~6px/side letterbox appears — the band overlap now covers it.
const slab = await sharp('docs/research/slabframe-user-1600.png')
  .resize(Math.round(SLAB_W * 0.9), Math.round(SLAB_H * 0.9), {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const previews = [];
for (const name of VARIANTS) {
  // --from-guide: the ring sits at a KNOWN rect on the 2:3 guide canvas
  // (1462×2348 centered on 1600×2400) — extract it exactly, no guessing.
  // Otherwise cover-crop the art to the frame box (no squeezing).
  let src = sharp(`docs/research/${name}.png`);
  if (FROM_GUIDE) {
    const m = await src.metadata();
    src = src.extract({
      left: Math.round((m.width * 69) / 1600),
      top: Math.round((m.height * 26) / 2400),
      width: Math.round((m.width * 1462) / 1600),
      height: Math.round((m.height * 2348) / 2400),
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
