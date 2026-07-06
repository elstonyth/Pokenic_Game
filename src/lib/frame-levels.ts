/**
 * Milestone avatar-frame levels — one frame per 10 levels, L1-9 have none.
 * Client-and-server safe (unlike lib/data/avatar-frames.ts, which is
 * server-only) so both the /me appearance UI and the setAvatarFrame server
 * action validate against the same list. Mirrors the backend's FRAME_LEVELS
 * in modules/packs/avatar-frames.ts.
 */
export const FRAME_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
