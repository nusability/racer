// Dev-only: marks the Dust Cup won in the save, then races a quick race on any world's track.
// usage: node tools/dev/play-world.mjs <url> <outDir> <world> <track> [seconds] [w] [h]
import { chromium } from 'playwright-core';
const [url, out, world, track, secs = '30', w = '844', h = '390'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.click('#title_start_button');
await page.evaluate(() => {
  // A fresh version-2 save with the Dust Cup already won (writes nothing until the game saves).
  localStorage.setItem('mirage-racer.save', JSON.stringify({
    version: 2, credits: 0, ownedRacers: ['dustwing'], selectedRacer: 'dustwing',
    upgrades: { dustwing: { engine: 0, thrusters: 0, steering: 0, tank: 0, armor: 0 } },
    cup: null, wonCups: ['dust'], records: {},
    settings: { steering: 'drag', sensitivity: 1, sound: true, quality: 'high' },
    raceSerial: 1, appliedRaceIds: [],
  }));
});
await page.reload();
await page.click('#title_start_button');
await page.click('#menu_quick_button');
const tab = page.locator(`[id*="_${world}_button"]`).first();
if (await tab.count()) await tab.click();
await page.click(`#quick_track_${track}_button`);
await page.screenshot({ path: `${out}/menu-${track}.png` });
if (await page.locator('#quick_race_button').count()) await page.click('#quick_race_button');
await page.keyboard.down('ArrowUp');
const t0 = Date.now();
let i = 0;
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/race-${track}-${String(i++).padStart(2, '0')}.png` });
}
console.log(errors.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
