// Build-time tool: renders a preview image of every track at its signature spot for the
// Quick Race cards and the cup race list. Run from web/: `node tools/thumbs.mjs`.
//
// It renders a STATIC build (vite build + vite preview), never the dev server, because HMR
// reloads pages while other files are being edited. Output: public/thumbs/<id>.webp plus
// public/thumbs/thumbs.json (which s each image used).
//
// `node tools/thumbs.mjs --explore <dir>` instead renders every landmark of every track from a
// few distances into <dir> with one contact sheet per track, for choosing the SHOTS below.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(WEB, 'public', 'thumbs');
const PORT = 5181;
const WIDTH = 640;
const HEIGHT = 360;
/** WebP quality: keeps each thumb under ~60 KB at 640x360. */
const WEBP_QUALITY = 0.72;
const MAX_BYTES = 60 * 1024;
/** Frames the scene gets to settle (textures, instancing) before the shot. */
const SETTLE_MS = 1500;
const EXPLORE_BACKS = [90, 220];

/**
 * The signature moment per track: `at` is a control-point parameter (like the track data),
 * the camera sits `back` metres before it at lateral `x`, on ribbon `branch` (-1 = main loop).
 */
const SHOTS = {
  sunpan: { at: 8.5, back: 220, x: 0, branch: -1, why: 'spaceport' },
  rattlesnake: { at: 7.9, back: 90, x: 0, branch: -1, why: 'mine' },
  oasis: { at: 7.4, back: 90, x: 0, branch: -1, why: 'oasis town' },
  bonecanyon: { at: 5.5, back: 220, x: 0, branch: -1, why: 'colossus' },
  glasssea: { at: 8.4, back: 90, x: 0, branch: -1, why: 'sand beast' },
  devilsteeth: { at: 5.45, back: 90, x: 0, branch: -1, why: 'mine' },
  mirageh: { at: 14.5, back: 220, x: 0, branch: -1, why: 'colossus' },
  stormfront: { at: 2.3, back: 220, x: 0, branch: -1, why: 'invasion' },
};

const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
/** The viewer's own overlay (stats, minimap, picker) must not appear in the thumbs. */
const HIDE_OVERLAY = 'body > :not(canvas) { display: none !important; }';

function build(outDir) {
  const r = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: WEB, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`vite build failed (${r.status})`);
}

async function preview(outDir) {
  const proc = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    proc.on('exit', (code) => reject(new Error(`vite preview exited (${code})`)));
    proc.stdout.on('data', (d) => {
      if (String(d).includes(String(PORT))) resolve();
    });
  });
  return proc;
}

async function shoot(page, trackId, shot) {
  await page.goto(`http://localhost:${PORT}/track-viewer.html?track=${trackId}&pause=1&view=fly`);
  await page.addStyleTag({ content: HIDE_OVERLAY });
  await page.waitForFunction(() => 'viewer' in window);
  const s = await page.evaluate(({ at, back, x, branch }) => {
    const v = window.viewer;
    const ribbon = v.track.ribbon(branch);
    const target = ribbon.paramToS(at) - back;
    v.set({ branch, s: target, x, view: 'fly', paused: true });
    return ribbon.wrap(target);
  }, shot);
  await page.waitForTimeout(SETTLE_MS);
  page.assertClean();
  return { s, png: await page.screenshot({ type: 'png' }) };
}

/** Chromium encodes WebP from a canvas; Playwright screenshots only do PNG/JPEG. */
async function toWebp(page, png) {
  const b64 = await page.evaluate(
    async ({ data, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', q).split(',')[1];
    },
    { data: png.toString('base64'), q: WEBP_QUALITY },
  );
  return Buffer.from(b64, 'base64');
}

async function run() {
  const exploreIdx = process.argv.indexOf('--explore');
  const exploreDir = exploreIdx > 0 ? process.argv[exploreIdx + 1] : null;
  if (exploreIdx > 0 && !exploreDir) throw new Error('--explore needs an output directory');
  const buildDir = mkdtempSync(join(tmpdir(), 'mirage-thumbs-'));
  build(buildDir);
  const server = await preview(buildDir);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: BROWSER_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    // A viewer error would silently produce a wrong thumb, so any page error fails the run.
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(new Error(m.text()));
    });
    page.assertClean = () => {
      if (errors.length) throw errors[0];
    };
    if (exploreDir) await explore(page, exploreDir);
    else await renderAll(page);
  } finally {
    await browser.close();
    server.kill();
    rmSync(buildDir, { recursive: true, force: true });
  }
}

async function renderAll(page) {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const [id, shot] of Object.entries(SHOTS)) {
    const { s, png } = await shoot(page, id, shot);
    const webp = await toWebp(page, png);
    if (webp.length > MAX_BYTES) throw new Error(`${id}.webp is ${webp.length} bytes (> ${MAX_BYTES})`);
    writeFileSync(join(OUT_DIR, `${id}.webp`), webp);
    manifest[id] = { s: Math.round(s), x: shot.x, branch: shot.branch, subject: shot.why };
    console.log(`${id}: s=${Math.round(s)} ${(webp.length / 1024).toFixed(1)} KB (${shot.why})`);
  }
  writeFileSync(join(OUT_DIR, 'thumbs.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function explore(page, dir) {
  mkdirSync(dir, { recursive: true });
  for (const id of Object.keys(SHOTS)) {
    await page.goto(`http://localhost:${PORT}/track-viewer.html?track=${id}&pause=1`);
    await page.waitForFunction(() => 'viewer' in window);
    const landmarks = await page.evaluate(() => window.viewer.track.def.landmarks.filter((l) => !l.branch).map((l) => ({ kind: l.kind, at: l.at })));
    const tiles = [];
    for (const l of landmarks) {
      for (const back of EXPLORE_BACKS) {
        const { png } = await shoot(page, id, { at: l.at, back, x: 0, branch: -1 });
        tiles.push({ label: `${l.kind} at ${l.at} back ${back}`, data: png.toString('base64') });
      }
    }
    const sheet = await page.context().newPage();
    await sheet.setViewportSize({ width: 1280, height: 200 * Math.ceil(tiles.length / 2) + 10 });
    await sheet.setContent(
      `<body style="margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:4px;font:14px monospace;color:#fff">${tiles
        .map((t) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${t.data}"><div>${t.label}</div></div>`)
        .join('')}</body>`,
    );
    await sheet.screenshot({ path: join(dir, `${id}-sheet.png`), fullPage: true });
    await sheet.close();
    console.log(`explored ${id}: ${tiles.length} shots`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
