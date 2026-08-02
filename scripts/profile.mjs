// Attaches the V8 sampling profiler and a long-task observer while the game
// plays, then reports the functions that actually burn time and the worst frame
// hitches. Use this instead of guessing at the cause of a stall.
//
//   node scripts/profile.mjs [url] [seconds]

import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5175/';
const SECONDS = Number(process.argv[3] ?? 70);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const box = await page.locator('.board canvas').boundingBox();
const toScreen = (mx, my) => ({
  x: box.x + (mx / 1536) * box.width,
  y: box.y + (my / 1024) * box.height,
});

async function build(name, mx, my) {
  const card = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
  if (await card.evaluate((el) => el.classList.contains('is-locked')).catch(() => true)) return false;
  await card.click();
  const p = toScreen(mx, my);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(70);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(110);
  await page.keyboard.press('Escape');
  return true;
}

// Good Plan Design is in here deliberately: its deny aura fires on every claim in
// radius at once, which is the kind of burst most likely to stall a frame.
const JUMP = Number(process.argv[4] ?? 0);
async function reinvest() {}
if (JUMP) {
  // Straight to a heavy late round with a full board.
  await page.evaluate((r) => window.containment.jumpTo(r), JUMP);
  await page.waitForTimeout(300);
} else {
  const PLAN = [
    ['Network', 1260, 620],
    ['Network', 460, 480],
    ['Care Navigation', 500, 500],
    ['Good Plan Design', 1240, 660],
    ['Reference-Based Pricing', 900, 600],
    ['NCCI Edits', 1300, 640],
    ['Cash Pay Card', 440, 700],
  ];
  for (const [n, x, y] of PLAN) if (!(await build(n, x, y))) break;
}

// Frame timing + long tasks, observed from inside the page.
await page.evaluate(() => {
  window.__long = [];
  window.__frames = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* longtask unsupported */
  }
  let last = performance.now();
  const tick = (t) => {
    window.__frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const client = await page.context().newCDPSession(page);
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 200 });
await client.send('Profiler.start');

await page.locator('.segmented--speed button', { hasText: '2×' }).click();
await page.locator('.toggle input').check();
if (JUMP) await page.evaluate((r) => window.containment.jumpTo(r), JUMP);
// autoStart above already kicks off the round; clicking would race the unmount.

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  await page.waitForTimeout(2500);
  await reinvest();
  if (await page.locator('.endcard').count()) break;
}

const { profile } = await client.send('Profiler.stop');

// --- aggregate self time per function -------------------------------------
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
for (const id of profile.samples) {
  const n = byId.get(id);
  if (!n) continue;
  const f = n.callFrame;
  const name = f.functionName || '(anonymous)';
  const url = (f.url || '').split('/').slice(-1)[0];
  const key = `${name} @ ${url}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + 1);
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);

console.log(`\n  CPU PROFILE  (${total} samples over ~${SECONDS}s)\n`);
for (const [k, n] of top) {
  const pct = (100 * n) / total;
  const bar = '█'.repeat(Math.max(1, Math.round(pct / 1.5)));
  console.log(`  ${pct.toFixed(1).padStart(5)}%  ${bar.padEnd(34)} ${k}`);
}

const { frames, long } = await page.evaluate(() => ({
  frames: window.__frames,
  long: window.__long,
}));
const sorted = [...frames].sort((a, b) => b - a);
console.log(`\n  FRAMES  (${frames.length} total)`);
console.log(`  worst: ${sorted.slice(0, 12).map((f) => Math.round(f) + 'ms').join('  ')}`);
console.log(`  over 100ms: ${frames.filter((f) => f > 100).length}   over 500ms: ${frames.filter((f) => f > 500).length}   over 1s: ${frames.filter((f) => f > 1000).length}`);
console.log(`\n  LONG TASKS  (${long.length})`);
console.log('  ' + long.sort((a, b) => b.dur - a.dur).slice(0, 12).map((l) => `${l.dur}ms`).join('  '));

await browser.close();
