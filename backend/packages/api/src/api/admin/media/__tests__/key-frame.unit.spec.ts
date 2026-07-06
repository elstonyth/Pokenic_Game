import sharp from 'sharp';
import { keyMagentaFrame } from '../key-frame';

// Synthetic chroma-key render: magenta canvas + a grey "slab" rect whose own
// card window is magenta again — the shape every AI prompt template produces.
// `key` overrides the magenta so tests can mimic models that render the
// requested #FF00FF as a duller purple (observed live: rgb(196,29,161)).
async function syntheticRender(key = 'rgb(255,0,255)'): Promise<Buffer> {
  const slab = Buffer.from(
    `<svg width="500" height="800">
       <rect width="500" height="800" fill="${key}"/>
       <rect x="50" y="80" width="400" height="640" fill="rgb(120,120,124)"/>
       <rect x="90" y="260" width="320" height="420" fill="${key}"/>
     </svg>`,
  );
  return sharp(slab).png().toBuffer();
}

describe('keyMagentaFrame', () => {
  it('keys magenta to transparency, crops to the slab, keeps the shell opaque', async () => {
    const out = await keyMagentaFrame(await syntheticRender());
    expect(out).not.toBeNull();

    const { data, info } = await sharp(out!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = info;
    // cropped to the 400x640 slab, resized to width 800 → 800x1280
    expect(W).toBe(800);
    expect(Math.abs(H - 1280)).toBeLessThanOrEqual(2);

    const alphaAt = (x: number, y: number) => data[(y * W + x) * 4 + 3];
    // shell border (top strip inside the slab, above the window) → opaque
    expect(alphaAt(W >> 1, Math.round(H * 0.15))).toBeGreaterThan(200);
    // card window centre → keyed out
    expect(alphaAt(W >> 1, Math.round(H * 0.55))).toBe(0);
  });

  it('keys a DULL magenta render too (model ignored #FF00FF)', async () => {
    const out = await keyMagentaFrame(await syntheticRender('rgb(196,29,161)'));
    expect(out).not.toBeNull();
    const { data, info } = await sharp(out!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = info;
    const alphaAt = (x: number, y: number) => data[(y * W + x) * 4 + 3];
    expect(alphaAt(W >> 1, Math.round(H * 0.15))).toBeGreaterThan(200); // shell
    expect(alphaAt(W >> 1, Math.round(H * 0.55))).toBe(0); // window keyed
  });

  it('returns null for an image with no chroma key (already-transparent upload)', async () => {
    const plain = await sharp(
      Buffer.from(
        '<svg width="400" height="640"><rect width="400" height="640" fill="rgb(30,30,32)"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect(await keyMagentaFrame(plain)).toBeNull();
  });

  it('survives the despill: greys near the key stay neutral, not pink', async () => {
    const out = await keyMagentaFrame(await syntheticRender());
    const { data, info } = await sharp(out!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = info;
    const i = ((Math.round(H * 0.15) * W + (W >> 1)) * 4) as number;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // shell grey must stay grey-ish (no magenta cast): R≈G≈B within noise
    expect(Math.abs(r - g)).toBeLessThan(12);
    expect(Math.abs(b - g)).toBeLessThan(12);
  });
});
