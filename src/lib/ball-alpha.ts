// Edge flood-fill: make the contiguous near-white BACKGROUND transparent while
// preserving white that's enclosed by darker pixels (the ball's own white parts).
// Pure: operates on an RGBA Uint8Array in place. No I/O. Used by scripts/process-balls.mjs.

export interface FloodOpts {
  /** A pixel counts as "white background" when R,G,B are all >= threshold. */
  threshold?: number;
}

export function floodFillAlpha(
  rgba: Uint8Array,
  width: number,
  height: number,
  opts: FloodOpts = {},
): void {
  const threshold = opts.threshold ?? 240;
  const isWhite = (idx: number) =>
    rgba[idx] >= threshold &&
    rgba[idx + 1] >= threshold &&
    rgba[idx + 2] >= threshold;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isWhite(p * 4)) stack.push(p);
  };

  // Seed from every border pixel.
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop() as number;
    rgba[p * 4 + 3] = 0; // transparent
    const x = p % width;
    const y = (p / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}
