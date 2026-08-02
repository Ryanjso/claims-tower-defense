// Drives the running dev server in a real browser and captures screenshots.
// Usage: node scripts/shoot.mjs [url]

import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5175/';
const OUT = '/tmp/shots';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-boot.png` });

// The canvas is letterboxed inside .board; map coords need that transform.
const box = await page.locator('.board canvas').boundingBox();
const MAP_W = 1536;
const MAP_H = 1024;
const toScreen = (mx, my) => ({
  x: box.x + (mx / MAP_W) * box.width,
  y: box.y + (my / MAP_H) * box.height,
});

async function build(towerName, mx, my) {
  await page.getByRole('button', { name: new RegExp(towerName, 'i') }).first().click();
  await page.waitForTimeout(150);
  const armed = await page.locator('.panel').last().innerText();
  const p = toScreen(mx, my);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  const hover = await page.locator('.panel').last().innerText();
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  const after = await page.locator('.panel').last().innerText();
  console.log(`[build ${towerName} @${mx},${my}]`);
  console.log('  armed :', armed.split('\n').slice(0, 2).join(' | '));
  console.log('  hover :', hover.split('\n').filter((l) => l.trim()).slice(-2).join(' | '));
  console.log('  after :', after.split('\n').slice(0, 2).join(' | '));
}

// A small opening board on verified-open ground beside the path.
await build('Network', 900, 600);
await build('Care Navigation', 520, 900);
await build('Reference-Based Pricing', 900, 400);
await page.keyboard.press('Escape');
// Arm a tower so the placement affordances are captured.
await page.getByRole('button', { name: /Good Plan Design/i }).first().click();
await page.mouse.move(...Object.values(toScreen(1000, 780)));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02b-placing.png` });
await page.keyboard.press('Escape');
await page.screenshot({ path: `${OUT}/02-built.png` });

// Run a few rounds at speed to get claims and combat on screen.
await page.getByRole('button', { name: /speed|3×/i }).last().click().catch(() => {});
for (let r = 0; r < 3; r++) {
  const go = page.locator('button.go');
  if (await go.count()) await go.first().click();
  await page.waitForTimeout(2600);
  if (r === 0) await page.screenshot({ path: `${OUT}/03-round.png` });
  await page.waitForTimeout(9000);
}
await page.screenshot({ path: `${OUT}/04-later.png` });

// Inspector on a selected tower.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const t = toScreen(900, 600);
await page.mouse.click(t.x, t.y);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-inspector.png` });

// Claim ladder reference.
await page.getByRole('button', { name: /claim types/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-ladder.png` });

// End-of-run scorecard.
await page.locator('.modal__close').click().catch(() => {});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const { sim } = window.containment;
  sim.billedEntered = 41061590;
  sim.billedLeaked = 186345;
  sim.round = 20;
  sim.lives = 153;
  sim.phase = 'won';
  window.containment.sync();
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/07-endcard.png` });

const hud = await page.locator('.hud').innerText();
console.log('--- HUD ---\n' + hud);
console.log('--- console errors ---');
console.log(errors.length ? errors.slice(0, 12).join('\n') : '(none)');

await browser.close();
