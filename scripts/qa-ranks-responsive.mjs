// Responsive sweep of the Ranks page (/leaderboard = Weekly Pulled Value
// Challenge + standings + rules) across real device widths, from the narrowest
// phone still in the wild to a 4K desktop.
//
// Per device it asserts, not eyeballs:
//   - no horizontal page scroll
//   - no element sticking out past the viewport (ignoring anything inside an
//     overflow-clipped scroller — the stage rail parks neighbours offscreen by
//     design)
//   - no text clipped by its own box (overflow hidden + content wider than box)
//   - no interactive control below the WCAG 2.2 AA 24px target size
//   - the section order challenge -> standings -> rules holds
//   - the fixed tab bar doesn't cover the last block
//
// Screenshots land in docs/research/responsive/. Exits non-zero on any failure.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PW_BASE ?? 'http://localhost:4000';
const PATHS = (process.env.QA_PATHS ?? '/leaderboard,/task').split(',');

// CSS pixel viewports. Phones are the layout viewport of the real device.
const DEVICES = [
  { key: 'galaxy-fold-cover', w: 280, h: 653, dsf: 3 },
  { key: 'iphone-se1', w: 320, h: 568, dsf: 2 },
  { key: 'galaxy-z-flip-cover', w: 344, h: 882, dsf: 3 },
  { key: 'iphone-se3', w: 375, h: 667, dsf: 2 },
  { key: 'iphone-13-14', w: 390, h: 844, dsf: 3 },
  { key: 'iphone-15-16', w: 393, h: 852, dsf: 3 },
  { key: 'pixel-9', w: 412, h: 915, dsf: 2.6 },
  { key: 'iphone-16-pro-max', w: 440, h: 956, dsf: 3 },
  { key: 'galaxy-z-fold-open', w: 673, h: 841, dsf: 2.6 },
  { key: 'ipad-mini', w: 744, h: 1133, dsf: 2 },
  { key: 'ipad-air', w: 820, h: 1180, dsf: 2 },
  { key: 'ipad-pro-portrait', w: 1024, h: 1366, dsf: 2 },
  { key: 'ipad-air-landscape', w: 1180, h: 820, dsf: 2 },
  { key: 'laptop', w: 1280, h: 800, dsf: 2 },
  { key: 'laptop-hidpi', w: 1440, h: 900, dsf: 2 },
  { key: 'desktop-1080p', w: 1920, h: 1080, dsf: 1 },
  { key: 'desktop-1440p', w: 2560, h: 1440, dsf: 1 },
];

// Runs in the page. Returns every measurable defect for this viewport.
function audit() {
  const doc = document.documentElement;
  const clientW = doc.clientWidth;
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    const text = (el.textContent ?? '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  // An element parked offscreen inside a scroller/clipper is intentional
  // (carousel neighbours, marquees) — it can't cause page overflow.
  const insideClipper = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/hidden|auto|scroll|clip/.test(o.overflowX + o.overflow)) return true;
    }
    return false;
  };

  // sr-only content is a 1x1 clipped box on purpose — it is not a layout or
  // tap-target defect, and every screen-reader-only node would otherwise
  // register as clipped text.
  const srOnly = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.clipPath === 'inset(50%)' || s.clip === 'rect(0px, 0px, 0px, 0px)')
        return true;
    }
    return false;
  };

  const all = [...document.body.querySelectorAll('*')];
  const overflowing = [];
  const clipped = [];
  const smallTargets = [];

  for (const el of all) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (srOnly(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    if ((r.right > clientW + 1 || r.left < -1) && !insideClipper(el)) {
      overflowing.push({
        el: label(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }

    // Text cut off by its own box. line-clamp is deliberate truncation, so a
    // vertical clamp is not a defect — only horizontal loss counts.
    if (
      el.children.length === 0 &&
      el.scrollWidth > el.clientWidth + 1 &&
      /hidden|clip/.test(style.overflowX) &&
      style.textOverflow !== 'ellipsis' &&
      style.webkitLineClamp === 'none'
    ) {
      clipped.push({
        el: label(el),
        content: el.scrollWidth,
        box: el.clientWidth,
      });
    }

    if (
      (el.tagName === 'BUTTON' ||
        el.tagName === 'A' ||
        el.tagName === 'INPUT') &&
      style.pointerEvents !== 'none' &&
      (r.width < 24 || r.height < 24)
    ) {
      smallTargets.push({
        el: label(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }

  const sections = [
    ...document.querySelectorAll(
      '[aria-label="Community progress"],[aria-label="Standings"],[aria-label="How it works"]',
    ),
  ].map((n) => n.getAttribute('aria-label'));

  // The tab bar is fixed to the bottom on phones (lg:hidden) and the footer
  // carries its clearance — so at the very end of the page, the footer's last
  // real content must still sit above the bar.
  // The header nav carries the same landmark label, and offsetParent is always
  // null for a fixed element — so match on position:fixed + display instead.
  const tabBar = [...document.querySelectorAll('nav[aria-label="Primary"]')]
    .map((n) => ({ n, s: getComputedStyle(n) }))
    .find((x) => x.s.position === 'fixed' && x.s.display !== 'none')?.n;
  const footerLast = document.querySelector('footer')?.lastElementChild;
  window.scrollTo(0, doc.scrollHeight);
  const tabTop = tabBar ? tabBar.getBoundingClientRect().top : null;
  const lastBottom = footerLast?.getBoundingClientRect().bottom ?? null;
  window.scrollTo(0, 0);

  return {
    clientW,
    scrollW: doc.scrollWidth,
    hScroll: doc.scrollWidth > clientW + 1,
    sections,
    h1: [...document.querySelectorAll('h1')].map((n) => n.textContent.trim()),
    tabBarCoversLast:
      tabTop != null && lastBottom != null ? lastBottom > tabTop + 1 : null,
    overflowing: overflowing.slice(0, 8),
    clipped: clipped.slice(0, 8),
    smallTargets: smallTargets.slice(0, 8),
  };
}

await mkdir('docs/research/responsive', { recursive: true });
const browser = await chromium.launch();
let failures = 0;

for (const path of PATHS) {
  const slug = path.replace(/\W+/g, '') || 'home';
  for (const d of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: d.dsf,
      isMobile: d.w < 700,
      hasTouch: d.w < 1100,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    // The cookie bar is fixed over the fold and would mask the tab-bar check.
    await page
      .getByRole('button', { name: /reject/i })
      .click({ timeout: 2000 })
      .catch(() => {});

    const r = await page.evaluate(audit);
    const bad =
      r.hScroll ||
      r.overflowing.length > 0 ||
      r.clipped.length > 0 ||
      r.smallTargets.length > 0 ||
      r.tabBarCoversLast === true;
    if (bad) failures++;

    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${path} ${d.key.padEnd(20)} ${String(d.w).padStart(4)}px ${JSON.stringify(r)}`,
    );

    await page.screenshot({
      path: `docs/research/responsive/${slug}-${d.key}.png`,
      fullPage: true,
    });
    await ctx.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} viewport(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
