// Pixel-measure the slab asset's real content bounds (alpha scan) and derive
// the exact ring geometry needed for a flush left/right fit.
import sharp from 'sharp';

const ASSET = process.argv[2] ?? 'docs/research/slabframe-user-1600.png';
const img = sharp(ASSET).ensureAlpha();
const { width: W, height: H } = await img.metadata();
const raw = await img.raw().toBuffer(); // RGBA

const alphaAt = (x, y) => raw[(y * W + x) * 4 + 3];

// First/last col/row where alpha crosses a threshold, scanned at 25/50/75%
// of the other axis (case edges are straight, so 3 probes agree).
function edges(threshold) {
  const probesY = [0.25, 0.5, 0.75].map((f) => Math.round(H * f));
  const probesX = [0.25, 0.5, 0.75].map((f) => Math.round(W * f));
  const firstX = probesY.map((y) => {
    for (let x = 0; x < W; x++) if (alphaAt(x, y) >= threshold) return x;
    return -1;
  });
  const lastX = probesY.map((y) => {
    for (let x = W - 1; x >= 0; x--) if (alphaAt(x, y) >= threshold) return x;
    return -1;
  });
  const firstY = probesX.map((x) => {
    for (let y = 0; y < H; y++) if (alphaAt(x, y) >= threshold) return y;
    return -1;
  });
  const lastY = probesX.map((x) => {
    for (let y = H - 1; y >= 0; y--) if (alphaAt(x, y) >= threshold) return y;
    return -1;
  });
  return { firstX, lastX, firstY, lastY };
}

console.log(`asset: ${W}x${H} (aspect ${(W / H).toFixed(4)})`);
for (const t of [8, 128, 230]) {
  const e = edges(t);
  console.log(
    `alpha>=${t}: left ${e.firstX} right ${e.lastX} top ${e.firstY} bottom ${e.lastY}`,
  );
}
