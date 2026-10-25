// Build-time tool: renders a preview image of every track at its signature spot for the
// Quick Race cards and the cup race list. Run from web/: `node tools/thumbs.mjs`.
//
// It renders a STATIC build (vite build + vite preview), never the dev server, because HMR
// reloads pages while other files are being edited. Output: public/thumbs/<id>.webp plus
// public/thumbs/thumbs.json (which s each image used).
//
// `node tools/thumbs.mjs --track a,b` renders only those tracks into the existing manifest.
// `node tools/thumbs.mjs --explore <dir> [--track a,b] [--candidates file.json]` instead renders
// evenly spaced spots (or the given candidate shots) into one contact sheet per track, for
// choosing the SHOTS below.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(WEB, 'public', 'thumbs');
const VITE = join(WEB, 'node_modules', 'vite', 'bin', 'vite.js');
/** Imported by the menus (src/ui/trackArt.ts): which s each thumb used, plus the outline. */
const MANIFEST = join(WEB, 'src', 'data', 'trackThumbs.json');
/** Outline vertices per ribbon; enough for a ~48 px corner icon. */
const OUTLINE_POINTS = 96;
const WIDTH = 640;
const HEIGHT = 360;
/** WebP quality: keeps each thumb under ~60 KB at 640x360. */
const WEBP_QUALITY = 0.85;
const MAX_BYTES = 60 * 1024;
/** Frames the scene gets to settle (textures, instancing) before the shot. */
const SETTLE_MS = 1500;
/**
 * Where in its cycle a hazard looks most dramatic: a sweeper halfway across, a dropper's
 * loads just landed (seconds after the warning), a blocker half raised, a gust mid-blow.
 */
const HAZARD_SHOW = { sweeper: 0.5, dropper: 0.4, blocker: 0.5, gust: 0.5 };
/** Boost cells closer than this ahead of the camera are hidden for the shot. */
const CELL_CLEAR_M = 60;
/** Explore mode: evenly spaced candidate spots per lap. */
const EXPLORE_SPOTS = 12;

/**
 * The signature moment per track: `u` is the fraction of the ribbon's length where the chase
 * camera sits, at lateral `x`, on ribbon `branch` (-1 = main loop). Re-pick with --explore
 * when a track's layout changes.
 */
const SHOTS = {
  sunpan: { at: 8.5, ds: -170, hazard: 'liftoff', why: 'the spaceport ship lifting off over the road' },
  rattlesnake: { at: 31.4, x: -60, view: 'orbit', yaw: 0.3, pitch: 0.75, dist: 330, hazard: 'ore', hazardAt: 2.8, why: 'Fang Gulch and the switchbacks from above' },
  oasis: { at: 19.4, view: 'orbit', yaw: -0.9, pitch: 0.5, dist: 150, why: 'the bridge crossing by the fair' },
  bonecanyon: { at: 11, ds: -90, hazard: 'neck', why: 'the sand beast rearing over the road' },
  glasssea: { at: 5, ds: -20, view: 'orbit', yaw: -0.6, pitch: 0.3, dist: 110, hazard: 'beast', why: 'the sand beast arch at dusk' },
  devilsteeth: { at: 6.3, x: 60, view: 'orbit', yaw: -0.3, pitch: 0.75, dist: 330, hazard: 'spill', hazardAt: 2.8, why: 'the hairpins from above' },
  mirageh: { at: 2, ds: -100, why: 'the loop under the balloons' },
  stormfront: { at: 4.02, view: 'orbit', yaw: -0.9, pitch: 0.5, dist: 150, why: 'the bridge knot with a strider beyond' },
  coralcove: { at: 9.8, view: 'orbit', yaw: -1, pitch: 0.2, dist: 120, why: 'the lagoon and the air show' },
  lagoonloop: { at: 5.2, ds: -20, view: 'orbit', yaw: 0.6, pitch: 0.3, dist: 110, hazard: 'breach', why: 'the whale breaching over the lagoon road' },
  boardwalk: { at: 25.35, view: 'orbit', yaw: -0.9, pitch: 0.5, dist: 150, why: 'the boardwalk bridge crossing' },
  seastacks: { at: 9.95, ds: -20, view: 'orbit', yaw: -0.6, pitch: 0.3, dist: 110, hazard: 'freighter', why: 'the freighter closing the channel' },
  tidalcaves: { at: 30.5, view: 'orbit', yaw: 0.9, pitch: 0.5, dist: 150, why: 'the crossing over the surf' },
  volcanoisle: { at: 4.4, ds: -170, hazard: 'bombs', why: 'the volcano throwing lava bombs' },
  snowfield: { at: 6.2, ds: -20, view: 'orbit', yaw: -0.6, pitch: 0.3, dist: 110, hazard: 'herd', why: 'the mammoth herd crossing' },
  frozenharbor: { at: 27.6, ds: -20, view: 'orbit', yaw: 0.6, pitch: 0.3, dist: 110, hazard: 'icebreaker', why: 'the icebreaker crossing the road' },
  glacier: { at: 7, ds: -20, view: 'orbit', yaw: -0.6, pitch: 0.3, dist: 110, hazard: 'calving', why: 'the calving glacier slab' },
  icefalls: { at: 46, ds: -150, why: 'the frozen falls' },
  avalanche: { at: 24.6, view: 'orbit', yaw: 0.6, pitch: 0.3, dist: 200, why: 'the corkscrew on stilts' },
  auroracrown: { at: 43.2, ds: -60, view: 'orbit', yaw: 0.5, pitch: 0.2, dist: 90, why: 'the loop under the aurora' },
  downtown: { at: 2.09, ds: -100, why: 'the loop on the start boulevard' },
  harborbridge: { at: 60.5, view: 'orbit', yaw: -0.9, pitch: 0.5, dist: 150, why: 'the suspension bridge over the harbour road' },
  neonspiral: { at: 4.88, view: 'orbit', yaw: 0.9, pitch: 0.5, dist: 150, why: 'the spiral ramp crossing over the avenue' },
  undercity: { at: 19.5, view: 'orbit', yaw: -0.9, pitch: 0.5, dist: 150, why: 'the viaduct over the old town' },
  skyway: { at: 1.68, view: 'orbit', yaw: 0.6, pitch: 0.3, dist: 200, why: 'the double loop on the ring road' },
  zenithtower: { at: 12.67, ds: -60, view: 'orbit', yaw: 0.5, pitch: 0.2, dist: 120, why: 'the double loop off the west flyover' },
  ringdeck: { at: 2.6, ds: -100, why: 'the loop hung in the void on the start straight' },
  dockyard: { at: 35.685, ds: -20, view: 'orbit', yaw: 0.6, pitch: 0.3, dist: 110, hazard: 'arm', why: 'the docking arm swinging across the deck' },
  hollowrock: { at: 41, view: 'orbit', yaw: 2.6, pitch: 0.3, dist: 600, why: 'the tube bored through the hollow asteroid' },
  craterline: { at: 8.5, view: 'orbit', yaw: -1, pitch: 0.35, dist: 350, why: 'the road over the cratered moon' },
  sunfield: { at: 8.3, ds: -40, why: 'the mast maze between the solar arrays' },
  cloudtop: { at: 10.4, view: 'orbit', yaw: 0.8, pitch: 0.25, dist: 220, why: 'the corkscrew cage over the gas giant' },
};

const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
/** The viewer's overlay (stats, minimap canvas, picker) is added after its WebGL canvas; hide it all. */
const HIDE_OVERLAY = 'body > canvas ~ * { display: none !important; }';

/**
 * Builds only the track viewer: the game itself imports the manifest this tool writes, so
 * building it here would need the output before it exists.
 */
function build(outDir) {
  const config = join(outDir, '..', `${basename(outDir)}.vite.config.mjs`);
  const viewer = JSON.stringify(join(WEB, 'track-viewer.html'));
  writeFileSync(config, `export default { root: ${JSON.stringify(WEB)}, base: './', build: { target: 'es2022', chunkSizeWarningLimit: 1500, rollupOptions: { input: { trackViewer: ${viewer} } } } };\n`);
  const r = spawnSync(process.execPath, [VITE, 'build', '--config', config, '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: WEB, stdio: 'inherit' });
  rmSync(config);
  if (r.status !== 0) throw new Error(`vite build failed (${r.status})`);
}

/** Polling interval and limit while the preview server comes up. */
const SERVER_POLL_MS = 200;
const SERVER_TIMEOUT_MS = 30000;

/** Other tools may hold fixed ports, so the preview takes whatever port the OS hands out. */
async function freePort() {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}
let PORT = 0;

async function preview(outDir) {
  PORT = await freePort();
  // Run vite's own entry (not npx) so killing this process really stops the server.
  const proc = spawn(process.execPath, [VITE, 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: 'ignore' });
  let exited = null;
  proc.on('exit', (code) => (exited = code));
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`vite preview exited (${exited})`);
    try {
      if ((await fetch(`http://localhost:${PORT}/track-viewer.html`)).ok) return proc;
    } catch {
      // Not listening yet: the connection refusal is the expected "keep waiting" signal.
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_MS));
  }
  proc.kill();
  throw new Error('vite preview did not come up');
}

/**
 * One shot. Where: `u` (fraction of the ribbon) or `at` (control-point parameter, like the
 * track data) plus `ds` metres. Camera: 'fly' is the chase camera at `x`; 'orbit' looks at the
 * spot from `dist` metres at `pitch`, `yaw` radians round from straight behind (+ = towards the
 * track's left). `hazard` pins the race clock so that hazard is mid-action (`hazardAt` overrides
 * the moment: seconds into its cycle).
 */
async function shoot(page, trackId, shot) {
  await page.goto(`http://localhost:${PORT}/track-viewer.html?track=${trackId}&pause=1&view=fly`);
  await page.addStyleTag({ content: HIDE_OVERLAY });
  await page.waitForFunction(() => 'viewer' in window);
  const s = await page.evaluate(
    ({ shot, clear, show }) => {
      const v = window.viewer;
      const branch = shot.branch ?? -1;
      const ribbon = v.track.ribbon(branch);
      if ((shot.u === undefined) === (shot.at === undefined)) throw new Error('A shot needs exactly one of u or at');
      const target = ribbon.wrap((shot.u !== undefined ? ribbon.length * shot.u : ribbon.paramToS(shot.at)) + (shot.ds ?? 0));
      let time;
      if (shot.hazard) {
        const hz = v.track.def.features.filter((f) => f.kind === 'hazard').map((f) => f.hazard).find((h) => h.id === shot.hazard);
        if (!hz) throw new Error(`No hazard "${shot.hazard}" on this track`);
        const at = shot.hazardAt ?? { sweeper: hz.cross * show.sweeper, dropper: hz.warn + show.dropper, blocker: hz.warn + hz.up * show.blocker, gust: hz.on * show.gust }[hz.type];
        if (at === undefined) throw new Error(`No show time for hazard type "${hz.type}" (set hazardAt)`);
        time = (((at - hz.phase) % hz.period) + hz.period) % hz.period;
      }
      // A boost cell just ahead of the lens fills the frame with glow; take it first.
      for (const c of ribbon.cells) {
        const ahead = ribbon.delta(target, c.s);
        if (ahead > -10 && ahead < clear) v.collect(branch, c.index);
      }
      const view = shot.view ?? 'fly';
      const cam = { branch, s: target, x: shot.x ?? 0, view, paused: true, ...(time !== undefined ? { time } : {}) };
      if (view === 'orbit') {
        const t = ribbon.frameAt(target).tangent;
        Object.assign(cam, { yaw: Math.atan2(-t.z, -t.x) + (shot.yaw ?? 0), pitch: shot.pitch ?? 0.3, dist: shot.dist ?? 80 });
      }
      v.set(cam);
      return target;
    },
    { shot, clear: CELL_CLEAR_M, show: HAZARD_SHOW },
  );
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
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const page = await context.newPage();
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

/**
 * The lap (and shortcuts) as polylines in a 0..100 box, north up, aspect kept and centred.
 * Precomputed here because building a Track in the menu costs 100-300 ms per track.
 */
async function outline(page) {
  return page.evaluate((n) => {
    const t = window.viewer.track;
    const ribbons = [t.samples, ...t.branches.map((b) => b.ribbon.samples)].map((ss) => ss.map((p) => p.pos));
    const all = ribbons.flat();
    const minX = Math.min(...all.map((p) => p.x));
    const minZ = Math.min(...all.map((p) => p.z));
    const w = Math.max(...all.map((p) => p.x)) - minX;
    const d = Math.max(...all.map((p) => p.z)) - minZ;
    const k = 100 / Math.max(w, d);
    const ox = (100 - w * k) / 2;
    const oz = (100 - d * k) / 2;
    const thin = (pts, count) =>
      Array.from({ length: count }, (_, i) => pts[Math.floor((i * (pts.length - 1)) / (count - 1))]).map((p) => [
        Math.round(((p.x - minX) * k + ox) * 10) / 10,
        Math.round(((p.z - minZ) * k + oz) * 10) / 10,
      ]);
    const [loop, ...branches] = ribbons;
    return { outline: thin(loop, n), branches: branches.map((b) => thin(b, Math.max(8, Math.round((n * b.length) / loop.length)))) };
  }, OUTLINE_POINTS);
}

/** Every track the game ships, read from the viewer's track picker. */
async function trackIds(page) {
  await page.goto(`http://localhost:${PORT}/track-viewer.html?pause=1`);
  return page.$$eval('select option', (os) => os.map((o) => o.value));
}

/** `--track a,b`: render only those tracks and keep every other entry of the manifest. */
function onlyTracks() {
  const i = process.argv.indexOf('--track');
  if (i < 0) return null;
  const ids = process.argv[i + 1];
  if (!ids) throw new Error('--track needs a comma-separated list of track ids');
  return ids.split(',');
}

async function renderAll(page) {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = onlyTracks();
  const manifest = only ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const ids = await trackIds(page);
  for (const id of only ?? []) if (!ids.includes(id)) throw new Error(`--track: no track "${id}" in the viewer`);
  for (const id of only ?? ids) {
    const shot = SHOTS[id];
    if (!shot) throw new Error(`No thumbnail shot for track "${id}": add it to SHOTS (pick one with --explore)`);
    const { s, png } = await shoot(page, id, shot);
    const webp = await toWebp(page, png);
    if (webp.length > MAX_BYTES) throw new Error(`${id}.webp is ${webp.length} bytes (> ${MAX_BYTES})`);
    writeFileSync(join(OUT_DIR, `${id}.webp`), webp);
    manifest[id] = { image: `thumbs/${id}.webp`, s: Math.round(s), x: shot.x ?? 0, branch: shot.branch ?? -1, view: shot.view ?? 'fly', subject: shot.why, ...(await outline(page)) };
    console.log(`${id}: s=${Math.round(s)} ${(webp.length / 1024).toFixed(1)} KB (${shot.why})`);
  }
  // Manifest order follows the viewer's track list, whichever tracks this run rendered.
  const ordered = Object.fromEntries(ids.filter((id) => id in manifest).map((id) => [id, manifest[id]]));
  writeFileSync(MANIFEST, `${JSON.stringify(ordered)}\n`);
}

async function explore(page, dir) {
  mkdirSync(dir, { recursive: true });
  const only = onlyTracks();
  // --candidates <file.json>: { trackId: [shot, ...] } to compare specific framings.
  const candidates = process.argv.includes('--candidates') ? JSON.parse(readFileSync(process.argv[process.argv.indexOf('--candidates') + 1], 'utf8')) : null;
  for (const id of await trackIds(page)) {
    if (only && !only.includes(id)) continue;
    const tiles = [];
    const shots = candidates ? (candidates[id] ?? []) : Array.from({ length: EXPLORE_SPOTS }, (_, k) => ({ u: k / EXPLORE_SPOTS }));
    for (const [k, shot] of shots.entries()) {
      const { png } = await shoot(page, id, shot);
      tiles.push({ label: `${id} #${k} ${JSON.stringify(shot)}`, data: png.toString('base64') });
    }
    if (!tiles.length) continue;
    const sheet = await page.context().newPage();
    await sheet.setViewportSize({ width: 1280, height: 400 });
    await sheet.setContent(
      `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;font:12px monospace;color:#fff;overflow-wrap:anywhere">${tiles
        .map((t) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${t.data}"><div>${t.label}</div></div>`)
        .join('')}</body>`,
    );
    await sheet.screenshot({ path: join(dir, `${id}-sheet.png`), fullPage: true });
    await sheet.close();
    console.log(`explored ${id}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
