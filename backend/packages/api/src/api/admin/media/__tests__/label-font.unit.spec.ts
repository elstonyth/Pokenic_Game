import sharp from 'sharp';
import { ensureLabelFont, LABEL_FONT_FAMILY } from '../label-font';

// §7: assert rendered metrics of a known string so a font regression fails a
// test instead of shipping. W-vs-i ink-width ratio separates Arial-metric
// Arimo (~4.2) from the DejaVu Sans fallback (~3.3) far outside noise.
const inkWidth = async (text: string): Promise<number> => {
  const svg = Buffer.from(
    `<svg width="4000" height="300" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="10" y="200" font-family="${LABEL_FONT_FAMILY}" font-size="100">${text}</text></svg>`,
  );
  const { info } = await sharp(svg)
    .trim()
    .toBuffer({ resolveWithObject: true });
  return info.width;
};

describe('bundled label font', () => {
  beforeAll(() => ensureLabelFont());

  it('resolves Arimo (Arial metrics), not a DejaVu fallback', async () => {
    const w = await inkWidth('WWWWWWWWWW');
    const i = await inkWidth('iiiiiiiiii');
    expect(w / i).toBeGreaterThan(3.8);
  });
});
