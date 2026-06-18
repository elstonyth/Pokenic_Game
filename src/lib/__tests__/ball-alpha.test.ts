import { describe, it, expect } from 'vitest';
import { floodFillAlpha } from '@/lib/ball-alpha';

// Build a 5x5 RGBA image: white border, a 3x3 dark ring enclosing a white center.
// Flood-fill from the edges must clear the OUTER white but keep the ENCLOSED center white.
function img(): Uint8Array {
  const W = 5,
    H = 5;
  const px = new Uint8Array(W * H * 4);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * W + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) set(x, y, 255, 255, 255); // all white
  // dark ring at radius 1 around center (1..3)
  for (let x = 1; x <= 3; x++) {
    set(x, 1, 10, 10, 10);
    set(x, 3, 10, 10, 10);
  }
  set(1, 2, 10, 10, 10);
  set(3, 2, 10, 10, 10);
  // center (2,2) stays white (enclosed)
  return px;
}

describe('floodFillAlpha', () => {
  it('clears background white but preserves enclosed white', () => {
    const px = img();
    floodFillAlpha(px, 5, 5, { threshold: 240 });
    const alpha = (x: number, y: number) => px[(y * 5 + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0); // corner background → transparent
    expect(alpha(2, 0)).toBe(0); // top edge background → transparent
    expect(alpha(2, 2)).toBe(255); // enclosed center white → preserved
    expect(alpha(1, 1)).toBe(255); // dark ring → opaque
  });

  it('does not cross below the threshold', () => {
    const px = img();
    floodFillAlpha(px, 5, 5, { threshold: 240 });
    // the dark ring pixels are never made transparent
    expect(px[(1 * 5 + 1) * 4 + 3]).toBe(255);
  });
});
