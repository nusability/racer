// Dev-only: prints every console message and page error while starting a quick race.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('pageerror', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await page.goto(process.argv[2]);
for (const sel of ['#title_start_button', '#menu_quick_button', `#quick_track_${process.argv[3] ?? 'sunpan'}_button`, '#quick_race_button']) {
  await page.click(sel, { timeout: 5000 }).then(() => console.log('clicked', sel), (e) => console.log('FAILED', sel, e.message.split('\n')[0]));
}
await page.waitForTimeout(3000);
console.log('session?', await page.evaluate(() => !!window.__session?.()));
await browser.close();
