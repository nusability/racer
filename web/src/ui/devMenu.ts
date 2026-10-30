// Dev-only entry (menu-viewer.html): the full menu flow with a fake race runtime, so every
// screen can be clicked through without the 3D game. Never imported by main.ts.
import { GameAudio } from '../audio/audio.ts';
import type { RaceLauncher, RaceOutcome, RacePerf, RaceRequest, ShowroomApi, WreckInfo } from '../game/types.ts';
import { runBenchmark } from '../render/benchmark.ts';
import { gpuName } from '../render/graphics.ts';
import { startApp } from './app.ts';
import { button, h } from './kit.ts';

const root = document.getElementById('app');
if (!root) throw new Error('menu-viewer: #app missing');

/** Wreck reasons the WRECK button cycles through, so every banner/headline copy gets seen. */
const FAKE_WRECKS: WreckInfo[] = [
  { reason: 'destroyed', cause: null },
  { reason: 'obstacle', cause: 'a boulder' },
  { reason: 'offEdge', cause: null },
  { reason: 'loopStall', cause: null },
  { reason: 'fell', cause: null },
  { reason: 'splash', cause: null },
  { reason: 'lost', cause: null },
];
let nextWreck = 0;

/**
 * Fake finish: the player lands where asked (or anywhere), rivals fill the rest in random
 * order, and the last rival is wrecked so DNF rows show up. A wrecked player goes last.
 */
function fakeOutcome(req: RaceRequest, playerPlace: number | null, wreck: WreckInfo | null): RaceOutcome {
  const player = req.entrants.find((e) => e.isPlayer);
  if (!player) throw new Error('fake race: no player entrant');
  const rivals = req.entrants.filter((e) => !e.isPlayer).sort(() => Math.random() - 0.5);
  const place = wreck ? req.entrants.length : (playerPlace ?? 1 + Math.floor(Math.random() * req.entrants.length));
  rivals.splice(place - 1, 0, player);
  const lap = 38 + Math.random() * 6;
  const aiWreck = rivals.length - 1 - [...rivals].reverse().findIndex((e) => !e.isPlayer);
  return {
    request: req,
    playerWreck: wreck,
    results: rivals.map((e, i) => {
      const dnf = e.isPlayer ? wreck !== null : i === aiWreck;
      return {
        id: e.id,
        name: e.name,
        racerId: e.racerId,
        place: i + 1,
        time: dnf ? null : lap * req.laps + i * (1 + Math.random() * 2),
        bestLap: lap - 1 + Math.random() * 2 + i * 0.3,
        isPlayer: e.isPlayer,
        dnf,
      };
    }),
  };
}

const launchRace: RaceLauncher = (req, onDone) => {
  const layer = h(
    'div',
    'app',
    h('div', 'screen', h('h2', 'hdr__title', `RACING… ${req.trackId} · ${req.laps} laps · ${req.mode}`), h('p', 'note', `${req.raceId} · seed ${req.seed} · grid: ${req.entrants.map((e) => e.name).join(', ')}`)),
  );
  layer.dataset.backdrop = 'sunset';
  const smooth: RacePerf = { sustainedSlow: false };
  const finish = (place: number | null, wreck: WreckInfo | null = null, perf = smooth) => {
    layer.remove();
    onDone(fakeOutcome(req, place, wreck), perf);
  };
  layer.firstElementChild?.append(
    h(
      'div',
      'actions',
      button({ id: 'fake_quit_button', label: 'QUIT', aria: 'Quit race', variant: 'ghost', onTap: () => (layer.remove(), onDone(null, smooth)) }),
      button({ id: 'fake_wreck_button', label: 'WRECK', aria: 'Get wrecked', onTap: () => finish(null, FAKE_WRECKS[nextWreck++ % FAKE_WRECKS.length]) }),
      // A race the graphics safety net counts as too slow: at an automatic level it steps down.
      button({ id: 'fake_slow_button', label: 'SLOW', aria: 'Finish a race that ran too slowly', onTap: () => finish(null, null, { sustainedSlow: true }) }),
      button({ id: 'fake_random_button', label: 'RANDOM', aria: 'Finish in a random place', onTap: () => finish(null) }),
      button({ id: 'fake_win_button', label: 'WIN', aria: 'Finish first', variant: 'primary', big: true, onTap: () => finish(1) }),
    ),
  );
  root.append(layer);
};

const showroom: ShowroomApi = {
  show: (visual) => console.info('[showroom] show', visual.style),
  hide: () => console.info('[showroom] hide'),
};

/**
 * The viewer's fake races (WIN in one tap) must never pay into the game's save: on the dev
 * server both pages share an origin, so the viewer keeps its career under its own key prefix.
 */
const viewerStore = {
  getItem: (key: string) => window.localStorage.getItem(`menu-viewer:${key}`),
  setItem: (key: string, value: string) => window.localStorage.setItem(`menu-viewer:${key}`, value),
};

/** The viewer has no game canvas; a throwaway context names the GPU the benchmark is recorded against. */
function probeGpu(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('menu-viewer: WebGL2 unavailable, so the graphics benchmark cannot run');
  const name = gpuName(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}

startApp({ root, launchRace, showroom, audio: new GameAudio(), store: viewerStore, graphics: { gpu: probeGpu(), benchmark: runBenchmark }, start: { screen: 'title' } });
