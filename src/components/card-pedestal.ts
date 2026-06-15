/**
 * Shared "pedestal card" chrome for the marketplace tile (MarketCard) and the
 * recent-pulls tile (PullCard): the dark radial spotlight behind the card art,
 * plus the frame + image hover physics — the three magic strings both tiles
 * had copy-pasted verbatim (and which silently drift apart when one is tweaked).
 * Per-card differences (aspect ratio, border/bg colour, image padding, the top
 * badge, the footer) stay local to each card — they are genuinely distinct, so
 * forcing them through one component would be a leaky, prop-heavy wrapper.
 *
 * NOTE: the /claw PackCard uses a different, explicit-dimension layout (no
 * pedestal; transition-colors, not a hover lift) and intentionally does NOT use
 * these.
 */

/** Dark radial spotlight backdrop behind the card art. */
export const PEDESTAL_BG =
  'bg-[radial-gradient(120%_80%_at_50%_15%,#2e2e2e_0%,#1c1c1c_55%,#141414_100%)]';

/** Card-frame hover: lift + shadow (the border colour stays per-card). */
export const PEDESTAL_FRAME_HOVER =
  'transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40';

/** Card art: contain + subtle zoom on frame hover (padding stays per-card). */
export const PEDESTAL_IMAGE =
  'object-contain transition-transform duration-300 ease-out group-hover/card:scale-[1.04]';
