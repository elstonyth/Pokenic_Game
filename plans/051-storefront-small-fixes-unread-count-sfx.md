# Plan 051: Storefront small fixes — true unread total on "Mark all read", halt slot SFX on unmount

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- "src/app/(account)/notifications" src/lib/actions/notifications.ts src/lib/use-sound.ts src/app/slots`
> On any change, compare the excerpts below; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

Two small confirmed storefront bugs:

1. **"Mark all read (N)" undercounts.** The button's N comes from the current page's rows only (page size 20), while the header beside it shows the TRUE unread total from the server. With 35 unread across pages, the header says "35 unread" and the button says "Mark all read (20)" — and the client comment justifying this is factually wrong (it claims the server count is page-scoped; the backend documents the opposite and the nav badge depends on the true-total semantics). `markAllRead` already clears everything server-side, so this is a lying label, not a data bug.
2. **One-shot slot SFX bleed past unmount.** `useSound`'s pool-build effect creates 7 `HTMLAudioElement`s and returns no cleanup; `SlotMachineClient`'s unmount effect clears timeouts but never halts audio. The looping reveal bed IS stopped elsewhere, but non-looping one-shots aren't — tapping Exit mid-reveal lets a multi-second `bigwin` fanfare play over the destination page, and an in-flight fade interval ticks briefly after unmount.

## Current state

- `src/app/(account)/notifications/NotificationsClient.tsx`:
  - `:24` — `const unread = items.filter((n) => !n.readAt).length;` (`items` = one page, `PAGE_SIZE = 20`).
  - `:119-122` — the wrong comment + gate:
    ```tsx
    {/* Derived from the rows we already hold — the server's unread_count is
        page-scoped over the same 50 rows, so passing it in would be a second
        source of truth for the same number. */}
    {unread > 0 && (
    ```
  - The component's props: `{ initial, page }` (see its signature at the top of the file). The optimistic per-row `items`/`readAt` state is CORRECT and stays.
- `src/app/(account)/notifications/page.tsx` — the server component already holds the true total: `res.unreadCount` drives the header sub ("N unread — tap a notification…"); renders `<NotificationsClient key={res.page} initial={res.notifications} page={res.page} />` — the total is simply not passed down.
- Backend contract — `backend/packages/api/src/api/store/notifications/route.ts:22-25`:
  ```
  // unread_count: TRUE unread total across ALL the customer's feed notifications
  // (not page-scoped): total feed rows minus notification_read rows with a
  // read_at, both counted server-side. The nav badge and the /notifications
  // header rely on this spanning beyond the returned page.
  ```
- `src/lib/use-sound.ts`:
  - `:53-56` — `const pool = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({});` and `fadeTimer = useRef<number | null>(null);`
  - `:58-67` — the mount effect (no cleanup return):
    ```ts
    useEffect(() => {
      setMuted(readMuted());
      for (const [name, src] of Object.entries(FILES)) {
        const audio = new Audio(src);
        audio.preload = 'auto';
        pool.current[name as SoundName] = audio;
      }
    }, []);
    ```
  - `:92-96` — `halt(name)` exists (pauses one element); `:176` another pause site. The fix belongs in the hook (root cause: every consumer of `useSound` gets leak-free teardown), not in `SlotMachineClient`.
- Storefront conventions: vitest via `npm run test`; tests colocated under `src/lib/__tests__/` and `src/lib/actions/__tests__/`; strict TS; comments explain "why".

## Commands you will need

| Purpose   | Command (repo root) | Expected                                 |
| --------- | ------------------- | ---------------------------------------- |
| Typecheck | `npm run typecheck` | exit 0                                   |
| Lint      | `npm run lint`      | exit 0 (8 pre-existing warnings allowed) |
| Tests     | `npm run test`      | all pass                                 |
| Full gate | `npm run check`     | exit 0 (lint+typecheck+build)            |

## Scope

**In scope**:

- `src/app/(account)/notifications/NotificationsClient.tsx`
- `src/app/(account)/notifications/page.tsx`
- `src/lib/use-sound.ts`
- `src/lib/notifications/unread-total.ts` (create — the pure helper, see Test plan)
- New/extended tests under `src/lib/__tests__/` or `src/lib/notifications/__tests__/` (see Test plan)

**Out of scope**:

- `src/lib/actions/notifications.ts` and the backend route — contracts already correct.
- `SlotMachineClient.tsx` / `RevealStage.tsx` — the hook-level cleanup covers them; don't add belt-and-braces halts there.
- The optimistic mark-read row logic in `NotificationsClient` — keep it exactly as is.

## Git workflow

- Branch: `advisor/051-storefront-small-fixes`
- Commits: `fix(notifications): label Mark-all-read with the true unread total` and `fix(slots): halt pooled SFX + fade timer on unmount`
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Thread the true total into the client

- `page.tsx`: pass `unreadCount={res.unreadCount}` into `<NotificationsClient>` (only in the `res.ok` branch; keep the `key={res.page}` remount).
- `NotificationsClient.tsx`: add `unreadCount: number` to props. Keep local `unread` (page-scoped) for row rendering decisions, but drive the BUTTON's visibility and label from a merged value: `const totalUnread = Math.max(unreadCount - (initialUnreadOnPage - unread), 0)` — where `initialUnreadOnPage` is computed once from `initial` (`useMemo` or module-level compute: `initial.filter(n => !n.readAt).length`). Rationale: optimistic per-row reads on THIS page must decrement the displayed total without a server round-trip; unread on other pages can't change under us except via this button. Label: `Mark all read ({totalUnread})`; render the button when `totalUnread > 0`.
- Delete the wrong comment; replace with one true sentence: `{/* unreadCount is the server's true cross-page total (route.ts contract); decremented locally as rows on this page get optimistically marked. */}`

**Verify**: `npm run typecheck` → 0. Manual reasoning check in code review: with 35 unread and 20 on page 1, initial label = 35; marking one row → 34.

### Step 2: Hook-level audio teardown

In `use-sound.ts`, give the pool-build effect a cleanup:

```ts
useEffect(() => {
  setMuted(readMuted());
  for (const [name, src] of Object.entries(FILES)) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    pool.current[name as SoundName] = audio;
  }
  const pool_ = pool.current;
  return () => {
    // One-shots (bigwin fanfare etc.) must not bleed past the machine's
    // unmount; the reveal-bed stop elsewhere doesn't cover them.
    for (const audio of Object.values(pool_)) audio?.pause();
    if (fadeTimer.current !== null) {
      window.clearInterval(fadeTimer.current);
      fadeTimer.current = null;
    }
  };
}, []);
```

Check how `fadeTimer` is set elsewhere in the file (`setInterval` vs `setTimeout`) and clear with the matching API. Keep the eslint-disable comment on the `setMuted` line as is.

**Verify**: `npm run typecheck` → 0; `npm run lint` → no NEW warnings.

### Step 3: Tests

See Test plan.

**Verify**: `npm run test` → all pass including new cases; `npm run check` → exit 0.

## Test plan

- **Unread total logic**: extract the merge into a pure exported helper — preferred home: `src/lib/notifications/unread-total.ts` (create; listed In scope) with its test at `src/lib/notifications/__tests__/unread-total.test.ts`; exporting from `NotificationsClient.tsx` is the fallback if the module split feels heavy. Signature: `displayUnreadTotal(serverTotal, initialUnreadOnPage, currentUnreadOnPage)`. Unit cases (vitest, model on `src/lib/__tests__/` style): 35/20/20→35; 35/20/19→34; 5/5/0→0 (clamped ≥0); server total smaller than page unread (pathological) → clamps, never negative.
- **use-sound teardown**: if an existing `use-sound` or hook test harness exists (check `src/lib/__tests__/`), add a case with `@testing-library/react` `renderHook` + jsdom: render, grab `pool` side-effects via `HTMLMediaElement.prototype.pause` spy, unmount, expect pause called ≥1. If no DOM-hook harness exists in the suite, a pure test is not achievable cheaply — state that in the report and rely on the typecheck + the review; do NOT bolt a new testing dependency into the repo for this.

## Done criteria

- [ ] `npm run check` exits 0; `npm run test` green with the new unread-total cases
- [ ] `grep -n "page-scoped over the same 50 rows" "src/app/(account)/notifications/NotificationsClient.tsx"` → 0 matches — NOTE the quotes: `(account)` unquoted is a Bash syntax error (`(` opens a subshell); quote EVERY path under `src/app/(account)/` in every shell command you write
- [ ] Button label sources the threaded `unreadCount`: `grep -c "unreadCount" "src/app/(account)/notifications/NotificationsClient.tsx"` → ≥2
- [ ] `use-sound.ts` mount effect returns a cleanup that pauses pool elements and clears the fade timer
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- `NotificationsClient` props/state shape differs from the excerpts (drift — #226 follow-ups may have landed).
- The fade timer turns out to be shared/cleared elsewhere in a way that makes the cleanup double-clear unsafe (read the `halt`/fade code first; report if the ownership is unclear).
- Threading `unreadCount` conflicts with the mount re-sync logic from the back-nav fix (read the `:42-50` `live`-guarded effect first; if it refreshes rows but not the total, note the small skew and keep the clamped merge — do NOT add a second fetch).

## Maintenance notes

- When the toast system (PR2 of the notifications spec) lands, the bell/count refresh strategy may change — the threaded prop pattern here stays valid (server total + local decrements).
- Reviewer: check the pathological clamp case — a stale RSC-cached `unreadCount` after back-nav must never render a negative.
- Deferred: preloading all 7 audio files eagerly on slots mount is a loading-strategy tweak (perf agent: micro, not worth doing).
