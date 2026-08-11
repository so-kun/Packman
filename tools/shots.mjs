// Drives the game in a headless browser and saves screenshots of a few states.
//   node tools/shots.mjs <outDir> [baseUrl]
// Requires a local server serving the repository root.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots';
const baseUrl = process.argv[3] || 'http://127.0.0.1:8123/index.html';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const shot = async (name) => {
  const el = await page.$('canvas');
  await el.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`  ${name}`);
};

// The machine powers on into its boot screen, then the attract loop.
await shot('01-boot');
await page.waitForTimeout(4000);
await shot('02-attract');

// Insert a coin and start a game.
await page.keyboard.press('5');
await page.waitForTimeout(400);
await shot('03-credit');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await shot('04-ready');

// Let the round run so actors spread out, then steer for a moment.
await page.waitForTimeout(3500);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(1500);
await shot('05-play');
await page.waitForTimeout(4000);
await shot('06-play-later');

// The coffee breaks only come round after boards 2, 5 and 9, so drive them
// directly rather than playing that far.
for (const [index, at] of [[1, 120], [2, 260], [3, 340]]) {
  await page.evaluate(async ({ index, at }) => {
    const m = await import('./src/cutscenes.js');
    const game = window.__game;
    game.cutscene = new m.Cutscene(index, game.renderer, game.audio);
    game.cutscene.hud = game;
    game.cutscene.score = game.score;
    game.cutscene.t = at;
    game.state = 'cutscene';
  }, { index, at });
  await page.waitForTimeout(300);
  await shot(`0${6 + index}-cutscene${index}`);
}

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
