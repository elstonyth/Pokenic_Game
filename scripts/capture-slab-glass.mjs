// Capture the LOCKED-IN tier slab frame (SlabImage, 2026-07-17), STATIC as of
// the 2026-07-17 operator change: the band is pre-rendered art
// (public/images/slab-frames/<tier>.webp, one per rarity, hue-tinted from one
// SnapGen dark-glass master) + a static CSS halo glow (box-shadow, no
// animation — the traveling light sweep was removed). Mirrors SlabImage.tsx
// exactly.
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
const SLAB_ASPECT = 1600 / 2700;
const BAND = 5; // ring thickness, % of width (uniform on all sides)
const VB_W = 1600;
const VB_H = Math.round(
  (VB_W / SLAB_ASPECT) * (1 - 2 * (BAND / 100) * (1 - SLAB_ASPECT)),
);
const OUTER_R = 147; // ≈ hole r (55) + band (80) + edge gap — uniform corners

const FRAME_INSET = `${(BAND * (1 - SLAB_ASPECT)).toFixed(4)}% 0`;
const FRAME_RADIUS = `${((OUTER_R / VB_W) * 100).toFixed(2)}% / ${((OUTER_R / VB_H) * 100).toFixed(2)}%`;

// Mirrors glowStyle / the frame <Image> / the well exactly. Static halo only
// — no light sweep (operator change, 2026-07-17).
const cell = (t) => `
  <div class="cell">
    <div class="slab">
      <span class="glow" style="
        box-shadow: 0 0 44px -2px rgba(${t.rgb},0.8), 0 0 90px -20px rgba(${t.rgb},0.6);
      "></span>
      <span class="framewrap">
        <img class="frameimg" src="${FRAME_SRC[t.key]}" />
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
  .well { position:absolute; inset:${BAND}%; }
  .well img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .name { font-size:13px; font-weight:800; letter-spacing:0.04em; }
</style></head><body>
  <h1>Locked-in tier slab frames — baked webp band + static halo (SlabImage 1:1)</h1>
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
    'done. files: docs/research/slab-glass-tiers.png + slab-glass-detail.png',
  );
} finally {
  await b.close();
}
