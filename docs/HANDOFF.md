# Phygitals Clone â€” Session Handoff

## Project
- **Storefront:** `C:\Users\PC\Desktop\Projects\Pokenic_Game` (Next.js 16 + React 19 + Tailwind v4)
- **Backend plan:** Medusa v2 wired **locally** (Postgres only; Redis/Socket.io optional, for prod/multi-process realtime), run as a `/backend` sibling to the root storefront — **local-first, no cloud host chosen**. See `docs/BUILD_PLAN.md`.
- **Git root is `storefront/` itself** (not parent) â€” so Agent worktree isolation from parent fails; dispatch builder agents in-place.

## Running the app (IMPORTANT)
- Use **production server** not dev (machine gets overloaded; dev serves images slowly â†’ looks "broken"):
  - `npm run build` then `npx next start -p 4000` (run_in_background).
  - Clear stuck port: `PID=$(netstat -ano | grep ':4000' | grep LISTENING | awk '{print $5}' | head -1); powershell -NoProfile -Command "Stop-Process -Id $PID -Force"`
- **Verify with Playwright** (installed), NOT Chrome MCP (cache confusion across ports caused hours of false "still broken"). Screenshots â†’ `docs/research/*.png`, read via Read tool.
- Browser MCP: TWO Chromes connect ("Work" + "Claude") â€” must select_browser by deviceId first. Avoid; prefer Playwright scripts.
- **Watch for runaway node processes** (hit 5000+/91GB once). Check: `powershell "@(Get-Process node).Count"`. Kill all: `powershell "Get-Process node | Stop-Process -Force"`.

## State of homepage clone (DONE + polished)
All sections built, assets LOCAL (53 files in /public, 0 hotlinks, 0 broken), full-width (no max-w caps anywhere â€” page.tsx, header, footer all uncapped).
- **HeroSection.tsx** â€” 3-card rotating carousel (rebuilt via pure-skill sub-agent from `docs/research/components/HeroSection.spec.md`). Specs: 6 themes, ROTATE_MS 2800, slots Â±11%/0.92scale/0.6op/Â±6deg tilt, center 0deg sharp. Glow = radial-gradient color FOLLOWS center card (per-theme RGB in THEMES[].glow). Hover lifts ONLY center card (pointer-events-auto center / none sides+hero, plain `hover:-translate-y-2 hover:scale-[1.03]`). Reduced-motion disables all. Hero box h-480, rounded-2xl, full width.
  - **JUST EDITED (needs build+restart+verify):** lowered pack to `bottom-[-18%] h-[72%]`, slab to `bottom-[4%] h-[56%]` (user wanted pack lower).
- OpenPacksSection â€” 6 cat cards, slab behind + ripped pack in front (`bottom-[-45%] z-1`), grid grid-cols-2 sm:3 md:6, hover lift `group-hover:-translate-y-2` on both imgs. FIXED.
- CtaSection â€” 7 fan imgs, hover lift fixed via wrapper-div split (inline transform on wrapper, group-hover on img).
- Header â€” has nav icons (Layers/PartyPopper/Store/Trophy/Sparkles/HelpCircle). Footer â€” full width.
- RecentPulls/Community/Leaderboard/HowItWorks â€” built, hover audited OK.

## ACTIVE TASK (in progress when compacted)
User said: "THE PACK SHOULD BE LOWER" (hero â€” DONE, edit applied, needs build+verify) "AND RECLONE HOW IT WORKS there's no entry animation. Make sure animations entry/ending/page-stopping/every component + sizes correct. Match every screen size."

### ðŸ”‘ CRITICAL DISCOVERY (verify this!)
Capturing the LIVE homepage "How it works" section, I found its text is:
**"Find the perfect pack" / "Buy with confidence" (Popular) / "Buy and sell instantly" / "Make money"**
â€” This is DIFFERENT from what I cloned (current HowItWorksSection.tsx has "Open a pack / Reveal your card / Keep, trade, or redeem"). The REAL section appears richer (4+ steps, "Works fun and simple" subtitle, "Learn more" link, a "Popular" badge). **My current clone of this section is WRONG/oversimplified.** Must re-extract the real DOM/content + its scroll-triggered entry animation (fade-up on scroll into view â€” likely IntersectionObserver/animation-timeline). Capture script: `scripts/hiw-entry.mjs` (entry samples were inconclusive â€” section already in view at o=1; need to park further above and use smaller scroll steps, or check for `animation-timeline: view()` / IntersectionObserver in page JS).

### Next steps
1. Build + restart server, verify hero pack is now lower (Playwright screenshot at 1920x1080).
2. Re-recon the REAL homepage "How It Works" section: exact DOM, all step cards (4?), text verbatim, images, the "Popular" badge, subtitle "Works fun and simple", "Learn more" link.
3. Capture its ENTRY animation precisely (scroll from far above, 30ms steps; inspect for IntersectionObserver / CSS animation-timeline / framer-motion). Document trigger threshold + before/after transform/opacity + duration/easing.
4. Write spec to `docs/research/components/HowItWorksSection.spec.md`, dispatch builder sub-agent (pure-skill Phase 3 Step 3), merge, QA at 390/768/1440/1920.
5. User wants ALL animations correct (entry, exit, scroll-stop) and responsive at EVERY screen size â€” test mobile too.

## User preferences (learned)
- Wants pixel-exact, measured (not guessed) clones. Capture frame-by-frame, measure getBoundingClientRect/computed styles, verify with numbers.
- Wants the clone-website skill used "pure" way (dispatch builder sub-agents from spec files), confirmed.
- Reviews via screenshots on wide monitor (1920+). Always test full-width.
- Memory pref file: `C:\Users\PC\.claude\projects\C--Users-PC-Desktop-Projects-Pokenic-Game\memory\phygitals-clone-workflow-pref.md`

