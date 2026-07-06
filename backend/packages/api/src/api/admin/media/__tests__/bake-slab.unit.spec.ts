import sharp from 'sharp';
import { composeSlab } from '../bake-slab';

// composeSlab geometry contract: output = frame-sized webp; the card photo
// covers the window rect (insets 28.33% / 10.47% / 6.66%); frame layers on top.
describe('composeSlab', () => {
  const makeFrame = (w: number, h: number) =>
    sharp({
      // fully transparent "frame" — lets the test sample the photo underneath
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
  const makePhoto = () =>
    sharp({
      create: { width: 300, height: 420, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

  it('outputs a frame-sized webp with the photo inside the window', async () => {
    const out = await composeSlab(await makeFrame(400, 669), await makePhoto());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(669);

    const { data, info } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => (y * info.width + x) * info.channels;
    // window centre → the red photo shows through the transparent frame
    const cy = Math.round(669 * 0.2833 + (669 * (1 - 0.2833 - 0.0666)) / 2);
    const c = px(200, cy);
    expect(data[c]).toBeGreaterThan(200); // R
    expect(data[c + 1]).toBeLessThan(50); // G
    // above the window (label area) → still transparent
    const t = px(200, Math.round(669 * 0.1));
    expect(data[t + 3]).toBe(0); // alpha
  });

  it('caps output at 1600px wide', async () => {
    const out = await composeSlab(await makeFrame(3200, 5352), await makePhoto());
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1600);
  });
});
