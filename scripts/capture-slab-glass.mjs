// Capture the LOCKED-IN tier slab frame (SlabImage, 2026-07-17): the band is
// pre-rendered art (public/images/slab-frames/<tier>.webp, one per rarity,
// hue-tinted from one SnapGen dark-glass master) + CSS breathing halo + the
// traveling light sweep masked to the band. Mirrors SlabImage.tsx exactly.
// Two screenshots ~1.2s apart prove the sweep/halo animations move.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// Source of truth: src/lib/rarity.ts RARITY_RGB
const TIERS = [
  { key: 'immortal', name: 'Immortal', rgb: '251, 146, 60' },
  { key: 'legendary', name: 'Legendary', rgb: '236, 72, 153' },
  { key: 'mythical', name: 'Mythical', rgb: '168, 85, 247' },
  { key: 'rare', name: 'Rare', rgb: '37, 99, 235' },
  { key: 'uncommon', name: 'Uncommon', rgb: '56, 189, 248' },
  { key: 'common', name: 'Common', rgb: '163, 163, 163' },
];

// data URLs — file:// subresources are blocked on setContent's about:blank.
const SLAB = `data:image/webp;base64,${(
  await readFile('public/images/slab-frame.webp')
).toString('base64')}`;
const FRAME_SRC = {};
for (const t of TIERS) {
  FRAME_SRC[t.key] = `data:image/webp;base64,${(
    await readFile(`public/images/slab-frames/${t.key}.webp`)
  ).toString('base64')}`;
}

// ==== geometry, 1:1 with src/components/SlabImage.tsx ====
const SLAB_ASPECT = 1600 / 2867;
const BAND = 5; // ring thickness, % of width (uniform on all sides)
const VB_W = 1600;
const VB_H = Math.round(
  (VB_W / SLAB_ASPECT) * (1 - 2 * (BAND / 100) * (1 - SLAB_ASPECT)),
);
const OUTER_R = 140; // ≈ hole r (48) + band (80) + edge gap — uniform corners
const HOLE_INSET = 92; // clear-plastic outline ≈95 (mean) − tuck
const HOLE_R = 48;

const rr = (x, y, w, h, r) => {
  const x1 = x + w;
  const y1 = y + h;
  return (
    `M${x + r},${y}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y + r}V${y1 - r}` +
    `A${r},${r} 0 0 1 ${x1 - r},${y1}H${x + r}A${r},${r} 0 0 1 ${x},${y1 - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`
  );
};
const RING_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VB_W} ${VB_H}'>` +
    `<path fill='white' fill-rule='evenodd' d='${rr(0, 0, VB_W, VB_H, OUTER_R)} ${rr(HOLE_INSET, HOLE_INSET, VB_W - 2 * HOLE_INSET, VB_H - 2 * HOLE_INSET, HOLE_R)}'/></svg>`,
)}") center / 100% 100% no-repeat`;

const FRAME_INSET = `${(BAND * (1 - SLAB_ASPECT)).toFixed(4)}% 0`;
const FRAME_RADIUS = `${((OUTER_R / VB_W) * 100).toFixed(2)}% / ${((OUTER_R / VB_H) * 100).toFixed(2)}%`;

// Mirrors glowStyle / the frame <Image> + masked sweep / the well exactly.
const cell = (t) => `
  <div class="cell">
    <div class="slab">
      <span class="glow slab-frame-glow" style="
        box-shadow: 0 0 44px -2px rgba(${t.rgb},0.8), 0 0 90px -20px rgba(${t.rgb},0.6);
      "></span>
      <span class="framewrap">
        <img class="frameimg" src="${FRAME_SRC[t.key]}" />
        <span class="lightbox">
          <span class="light slab-frame-light" style="
            background: conic-gradient(from 0deg,
              transparent 0deg,
              rgba(${t.rgb},0.9) 80deg,
              rgba(255,255,255,0.95) 100deg,
              rgba(${t.rgb},0.9) 120deg,
              transparent 200deg,
              rgba(255,255,255,0.5) 280deg,
              transparent 340deg);
          "></span>
        </span>
      </span>
      <span class="well"><img src="${SLAB}" /></span>
    </div>
    <div class="name" style="color:rgb(${t.rgb})">${t.name.toUpperCase()}</div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { background:#171717; font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px; }
  h1 { color:#fafafa; font-size:20px; font-weight:800; margin-bottom:28px; }
  .grid { display:grid; grid-template-columns:repeat(6, 1fr); gap:24px; }
  .cell { display:flex; flex-direction:column; align-items:center; gap:12px; }
  .slab { position:relative; width:100%; aspect-ratio:${SLAB_ASPECT}; }
  .glow { position:absolute; inset:${FRAME_INSET}; border-radius:${FRAME_RADIUS}; pointer-events:none; }
  .framewrap { position:absolute; inset:${FRAME_INSET}; pointer-events:none; }
  .frameimg { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; }
  .lightbox { position:absolute; inset:0; border-radius:${FRAME_RADIUS}; overflow:hidden;
              -webkit-mask:${RING_MASK}; mask:${RING_MASK}; }
  .light { position:absolute; left:50%; top:50%; width:220%; aspect-ratio:1;
           transform: translate(-50%,-50%); }
  .well { position:absolute; inset:${BAND}%; }
  .well img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .name { font-size:13px; font-weight:800; letter-spacing:0.04em; }
  @keyframes slab-frame-spin {
    from { transform: translate(-50%,-50%) rotate(0deg); }
    to { transform: translate(-50%,-50%) rotate(360deg); }
  }
  @keyframes slab-frame-pulse { 0%,100% { opacity:0.65; } 50% { opacity:1; } }
  .slab-frame-light { animation: slab-frame-spin 5s linear infinite; }
  .slab-frame-glow { animation: slab-frame-pulse 2.8s ease-in-out infinite; }
</style></head><body>
  <h1>Locked-in tier slab frames — baked webp band + halo + light sweep (SlabImage 1:1)</h1>
  <div class="grid">${TIERS.map(cell).join('')}</div>
</body></html>`;

const b = await chromium.launch();
try {
  const p = await b.newPage({
    viewport: { width: 1500, height: 640 },
    deviceScaleFactor: 2,
  });
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForFunction(
    () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 30000 },
  );
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'docs/research/slab-glass-tiers.png' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'docs/research/slab-glass-tiers-t2.png' });
  // Big single-slab detail (texture is invisible at grid scale).
  await p.setViewportSize({ width: 620, height: 1000 });
  await p.evaluate(() => {
    const grid = document.querySelector('.grid');
    grid.style.gridTemplateColumns = '1fr';
    [...grid.children].slice(1).forEach((c) => c.remove());
  });
  await p.waitForTimeout(400);
  await p.locator('.cell').screenshot({
    path: 'docs/research/slab-glass-detail.png',
  });
  console.log(
    'done. files: docs/research/slab-glass-tiers{,-t2}.png + slab-glass-detail.png',
  );
} finally {
  await b.close();
}
