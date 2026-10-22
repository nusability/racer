import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
await page.goto(process.argv[2]);
await page.click('#title_start_button');
await page.click('#menu_quick_button');
await page.click(`#quick_track_${process.argv[3] ?? 'rattlesnake'}_button`);
await page.click('#quick_race_button');
await page.keyboard.down('ArrowUp');
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(700);
  console.log(await page.evaluate(() => {
    const s = window.__session();
    const pi = s.playerIndex();
    const v = s.views[pi];
    const r = s.race.racers[pi];
    const cam = s.cam.camera;
    const p = v.model.root.position.clone().project(cam);
    return `t=${s.race.time.toFixed(2)} s=${r.s.toFixed(0)} x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} v=${r.speed.toFixed(0)} vis=${v.model.root.visible} screen=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(3)}) camDist=${cam.position.distanceTo(v.model.root.position).toFixed(1)}`;
  }));
}
await browser.close();
