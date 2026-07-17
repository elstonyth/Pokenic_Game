import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const LABEL_FONT_FAMILY = 'Arimo';

let installed = false;

// Materialise the bundled Arimo TTF + a minimal fontconfig into the OS temp
// dir and point fontconfig at it, so sharp/librsvg (pango) resolve 'Arimo'
// deterministically on dev AND the Linux prod container (which has no Arial).
// MUST run before the first <text> render in this process — fontconfig reads
// FONTCONFIG_PATH once, lazily, at first text layout. bakeSlabImage calls
// this before composing; the earlier mask SVGs contain no text.
//
// arimo-font-b64.ts is a ~662KB base64 module — imported lazily (only on the
// first, non-installed run) so app boot never pays for it. A top-level import
// retained the string in every jest module registry pulled in via bake-slab
// (the whole create/update-card workflow chain), contributing to the CI
// integration-http shard OOM. The `installed` fast-path below stays fully
// synchronous after the first call, so repeat bakes pay no import cost.
export async function ensureLabelFont(): Promise<void> {
  if (installed) return;
  const { ARIMO_FONT_B64 } = await import('./arimo-font-b64.js');
  const dir = path.join(tmpdir(), 'polycards-label-font');
  const cacheDir = path.join(dir, 'cache');
  const fontPath = path.join(dir, 'Arimo-Variable.ttf');
  const confPath = path.join(dir, 'fonts.conf');
  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(fontPath)) {
    writeFileSync(fontPath, Buffer.from(ARIMO_FONT_B64, 'base64'));
  }
  writeFileSync(
    confPath,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${dir}</dir>\n  <cachedir>${cacheDir}</cachedir>\n</fontconfig>\n`,
  );
  process.env.FONTCONFIG_PATH = dir;
  process.env.FONTCONFIG_FILE = confPath;
  installed = true;
}
