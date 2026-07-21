import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// The admin suite is logic-only (no DOM render harness), so we lock the
// tab-buffer fix with a static source check: the seed-once edit buffers survive
// a tab switch only because the Tabs.Content entries are forceMount-ed. A
// refactor that silently drops forceMount would re-introduce the silent
// edit-wipe — this test fails if the count regresses.
const count = (file: string, needle: RegExp) =>
  (readFileSync(file, 'utf8').match(needle) ?? []).length;

describe('challenge/VIP tab buffers survive tab switches', () => {
  it('challenge page forceMounts both tab contents', () => {
    const src = join(__dirname, 'page.tsx');
    expect(count(src, /forceMount/g)).toBeGreaterThanOrEqual(2);
  });

  it('daily-rewards page forceMounts its buffer-holding tabs', () => {
    // levels, frames, settings (boxes is excluded — it has its own discard prompt).
    const src = join(__dirname, '..', 'daily-rewards', 'page.tsx');
    expect(count(src, /forceMount/g)).toBeGreaterThanOrEqual(3);
  });
});
