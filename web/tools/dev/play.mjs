// Dev-only: drives the real game in Chromium and screenshots a race.
// usage: node tools/dev/play.mjs <url> <outDir> [track] [seconds] [w] [h]
import { chromium } from 'playwright-core';
const [url, out, track = 'sunpan', secs = '12', w = '844', h = '390'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.click('#title_start_button');
await page.click('#menu_quick_button');
await page.click(`#quick_track_${track}_button`);
if (await page.locator('#quick_race_button').count()) await page.click('#quick_race_button');
const t0 = Date.now();
let i = 0;
await page.keyboard.down('ArrowUp');
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(+(process.env.EVERY ?? 2000));
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 500) requestAnimationFrame(f); else r(n * 2); }; requestAnimationFrame(f); }));
  await page.screenshot({ path: `${out}/race-${track}-${String(i++).padStart(2, '0')}.png` });
  console.log('shot', i, 'fps', fps);
}
console.log(errors.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
