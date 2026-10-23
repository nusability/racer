// Dev-only entry (menu-viewer.html): the full menu flow with a fake race runtime, so every
// screen can be clicked through without the 3D game. Never imported by main.ts.
import { GameAudio } from '../audio/audio.ts';
import type { RaceLauncher, RaceOutcome, RaceRequest, ShowroomApi } from '../game/types.ts';
import { startApp } from './app.ts';
import { button, h } from './kit.ts';

const root = document.getElementById('app');
if (!root) throw new Error('menu-viewer: #app missing');

/** Fake finish: the player lands where asked (or anywhere), rivals fill the rest in random order. */
function fakeOutcome(req: RaceRequest, playerPlace: number | null): RaceOutcome {
  const player = req.entrants.find((e) => e.isPlayer);
  if (!player) throw new Error('fake race: no player entrant');
  const rivals = req.entrants.filter((e) => !e.isPlayer).sort(() => Math.random() - 0.5);
  const place = playerPlace ?? 1 + Math.floor(Math.random() * req.entrants.length);
  rivals.splice(place - 1, 0, player);
  const lap = 38 + Math.random() * 6;
  return {
    request: req,
    results: rivals.map((e, i) => ({
      id: e.id,
      name: e.name,
      racerId: e.racerId,
      place: i + 1,
      time: lap * req.laps + i * (1 + Math.random() * 2),
      bestLap: lap - 1 + Math.random() * 2 + i * 0.3,
      isPlayer: e.isPlayer,
    })),
  };
}

const launchRace: RaceLauncher = (req, onDone) => {
  const layer = h(
    'div',
    'app',
    h('div', 'screen', h('h2', 'hdr__title', `RACING… ${req.trackId} · ${req.laps} laps · ${req.mode}`), h('p', 'note', `${req.raceId} · seed ${req.seed} · grid: ${req.entrants.map((e) => e.name).join(', ')}`)),
  );
  layer.dataset.backdrop = 'sunset';
  const finish = (place: number | null) => {
    layer.remove();
    onDone(fakeOutcome(req, place));
  };
  layer.firstElementChild?.append(
    h(
      'div',
      'actions',
      button({ id: 'fake_quit_button', label: 'QUIT', aria: 'Quit race', variant: 'ghost', onTap: () => (layer.remove(), onDone(null)) }),
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

startApp({ root, launchRace, showroom, audio: new GameAudio(), store: viewerStore });
