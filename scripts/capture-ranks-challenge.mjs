// Verify the Weekly Pulled Value Challenge after its move from /task to the
// Ranks tab (/leaderboard): challenge block on top, standings below. Shoots
// mobile / tablet / desktop and reports any horizontal overflow (the stage
// carousel sizes rail items from the viewport, so a narrow container clips it).
import { chromium } from 'playwright';

const BASE = process.env.PW_BASE ?? 'http://localhost:4000';
const SIZES = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1280, height: 900 },
];

const browser = await chromium.launch();
for (const s of SIZES) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
  });
  await page.goto(`${BASE}/leaderboard`, { waitUntil: 'networkidle' });

  const report = await page.evaluate(() => ({
    h1: [...document.querySelectorAll('h1')].map((n) => n.textContent.trim()),
    hasChallenge: !!document.querySelector('[aria-label="Community progress"]'),
    hasStandings: !!document.querySelector('[aria-label="Standings"]'),
    // Section order down the page — rules must come last.
    order: [
      ...document.querySelectorAll(
        '[aria-label="Community progress"],[aria-label="Standings"],[aria-label="How it works"]',
      ),
    ].map((n) => n.getAttribute('aria-label')),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log(s.key, JSON.stringify(report));

  await page.screenshot({
    path: `docs/research/ranks-challenge-${s.key}.png`,
    fullPage: true,
  });
  await page.close();
}

// The Task tab is now a placeholder — check it points at Ranks.
const task = await browser.newPage({ viewport: { width: 390, height: 844 } });
await task.goto(`${BASE}/task`, { waitUntil: 'networkidle' });
console.log(
  'task',
  JSON.stringify({
    h1: (await task.locator('h1').first().textContent())?.trim(),
    link: await task.locator('a[href="/leaderboard"]').first().textContent(),
  }),
);
await task.screenshot({ path: 'docs/research/ranks-task-placeholder.png' });
await browser.close();
