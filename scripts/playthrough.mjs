// End-to-end browser run: builds a board, auto-plays rounds at 3x, reports FPS,
// console errors and the final scorecard. Verifies the renderer holds up at the
// entity counts late rounds produce, which the headless harness cannot see.

import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5175/';
const ROUNDS = Number(process.argv[3] ?? 20);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const box = await page.locator('.board canvas').boundingBox();
const toScreen = (mx, my) => ({
  x: box.x + (mx / 1536) * box.width,
  y: box.y + (my / 1024) * box.height,
});

async function build(name, mx, my) {
  const card = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
  if (!(await card.count())) return false;
  await card.click();
  const p = toScreen(mx, my);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(90);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(140);
  const savings = await page.locator('.stat--savings .stat__value').innerText();
  await page.keyboard.press('Escape');
  return savings;
}

// Build order and spots taken from the scripted player in scripts/balance.ts.
const PLAN = [
  ['Network', 1260, 620],
  ['Network', 460, 480],
  ['NCCI Edits', 1300, 640],
  ['Care Navigation', 500, 500],
  ['Reference-Based Pricing', 900, 600],
  ['Good Plan Design', 1240, 660],
  ['Cash Pay Card', 440, 700],
  ['Direct Contracts', 420, 500],
  ['Accumulators', 380, 700],
  ['Tracy', 400, 620],
  ['Stop-Loss', 420, 740],
];
let planIndex = 0;

/** Buys the next planned tower, else upgrades whatever is cheapest to upgrade. */
async function reinvest() {
  for (let guard = 0; guard < 6; guard++) {
    if (planIndex < PLAN.length) {
      const [name, x, y] = PLAN[planIndex];
      const card = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
      if (await card.evaluate((el) => el.classList.contains('is-locked')).catch(() => true)) return;
      const before = await page.locator('.stat--savings .stat__value').innerText();
      await build(name, x, y);
      const after = await page.locator('.stat--savings .stat__value').innerText();
      if (before === after) return; // could not afford or could not place
      planIndex++;
      continue;
    }
    // Everything bought: pour the rest into upgrades, cycling through the board.
    let upgraded = false;
    for (const [, x, y] of PLAN) {
      const p = toScreen(x, y);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(80);
      const up = page.locator('button.upgrade').first();
      if ((await up.count()) && !(await up.evaluate((el) => el.classList.contains('is-locked')))) {
        await up.click();
        await page.waitForTimeout(80);
        upgraded = true;
        break;
      }
    }
    await page.keyboard.press('Escape');
    if (!upgraded) return;
  }
}

await reinvest();

// Sample the animation frame rate from inside the page.
await page.evaluate(() => {
  window.__fps = { frames: 0, min: 999, samples: [] };
  let last = performance.now();
  const tick = (t) => {
    const dt = t - last;
    last = t;
    if (dt > 0) {
      const f = 1000 / dt;
      window.__fps.frames++;
      window.__fps.samples.push(f);
      if (window.__fps.samples.length > 4000) window.__fps.samples.shift();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.locator('.segmented--speed button', { hasText: '3×' }).click();
await page.locator('.toggle input').check();

const started = Date.now();
let lastRound = 0;
for (;;) {
  await page.waitForTimeout(2000);
  const roundTxt = await page.locator('.stat').nth(2).innerText();
  const m = roundTxt.match(/(\d+)\s*\/\s*(\d+)/);
  const round = m ? Number(m[1]) : 0;
  if (round !== lastRound) {
    lastRound = round;
    await reinvest();
    const lives = await page.locator('.stat--lives .stat__value').innerText();
    const save = await page.locator('.stat--savings .stat__value').innerText();
    process.stdout.write(`  round ${String(round).padStart(2)}  lives ${lives.padStart(4)}  savings ${save.padStart(8)}\n`);
  }
  const ended = await page.locator('.endcard').count();
  if (ended) break;
  if (round >= ROUNDS && lastRound >= ROUNDS) {
    // Give the final round time to resolve.
    await page.waitForTimeout(20000);
    if (await page.locator('.endcard').count()) break;
  }
  if (Date.now() - started > 16 * 60 * 1000) {
    console.log('  timed out');
    break;
  }
}

const fps = await page.evaluate(() => {
  const s = window.__fps.samples;
  if (!s.length) return null;
  const sorted = [...s].sort((a, b) => a - b);
  return {
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p5: sorted[Math.floor(sorted.length * 0.05)],
    min: sorted[0],
    n: s.length,
  };
});

await page.screenshot({ path: '/tmp/shots/07-end.png' });

const card = await page.locator('.endcard').count();
if (card) console.log('\n' + (await page.locator('.endcard').innerText()));
console.log('\n--- fps ---');
console.log(fps ? `mean ${fps.mean.toFixed(1)}  p5 ${fps.p5.toFixed(1)}  min ${fps.min.toFixed(1)}  (${fps.n} frames)` : 'no samples');
console.log('--- console errors ---');
console.log(errors.length ? [...new Set(errors)].slice(0, 10).join('\n') : '(none)');

await browser.close();
