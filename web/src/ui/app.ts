// The menu shell: owns its own layer inside the given root, routes between screens, and hands
// races to the runtime. The WebGL canvas behind it belongs to main.ts.
import './styles.css';
import type { GameAudio } from '../audio/audio.ts';
import { Career } from '../game/career.ts';
import { graphicsLevel, steppedDown } from '../game/graphics.ts';
import type { KeyValueStore } from '../game/save.ts';
import type { RaceLauncher, RacePerf, RaceRequest, ShowroomApi } from '../game/types.ts';
import { GraphicsAuto, type GraphicsDeps } from './graphicsAuto.ts';
import { h, toast } from './kit.ts';
import { championshipScreen, cupScreen, worldScreen } from './screens/championship.ts';
import type { AppCtx, Nav, Screen } from './screens/context.ts';
import { garageScreen } from './screens/garage.ts';
import { mainMenuScreen } from './screens/mainMenu.ts';
import { quickRaceScreen } from './screens/quickRace.ts';
import { resultsScreen } from './screens/results.ts';
import { settingsScreen } from './screens/settings.ts';
import { debugScreen } from './screens/debug.ts';
import { titleScreen } from './screens/title.ts';

export interface AppDeps {
  root: HTMLElement;
  launchRace: RaceLauncher;
  showroom: ShowroomApi;
  audio: GameAudio;
  /**
   * Where the career is saved. The game passes localStorage; dev pages pass their own store so
   * their fake races can never pay into the real save.
   */
  store: KeyValueStore;
  /** The automatic graphics level's benchmark and the GPU it is recorded against. */
  graphics: GraphicsDeps;
}

function build(ctx: AppCtx, nav: Nav): Screen {
  switch (nav.screen) {
    case 'title':
      return titleScreen(ctx);
    case 'menu':
      return mainMenuScreen(ctx);
    case 'championship':
      return championshipScreen(ctx);
    case 'world':
      return worldScreen(ctx, nav.worldId);
    case 'cup':
      return cupScreen(ctx, nav.cupId);
    case 'quick':
      return quickRaceScreen(ctx, nav.worldId, nav.trackId, nav.laps);
    case 'garage':
      return garageScreen(ctx, nav.racerId);
    case 'settings':
      return settingsScreen(ctx);
    case 'debug':
      return debugScreen(ctx);
    case 'results':
      return resultsScreen(ctx, nav.report);
  }
}

export function startApp(deps: AppDeps): void {
  const career = new Career(deps.store);
  deps.audio.setEnabled(career.save.settings.sound);
  const graphics = new GraphicsAuto(career, deps.graphics);

  const shell = h('div', 'app');
  deps.root.append(shell);
  let current: Screen | null = null;
  let racing = false;

  // One delegated listener gives every button the same click, instead of each screen wiring it.
  shell.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('button') : null;
    if (target && !target.disabled) deps.audio.oneShot('click');
  });

  function clear(): void {
    current?.dispose?.();
    current = null;
    shell.replaceChildren();
  }

  function go(nav: Nav): void {
    clear();
    current = build(ctx, nav);
    shell.dataset.backdrop = current.backdrop;
    shell.append(current.el);
  }

  function race(req: RaceRequest, back: Nav): void {
    if (racing) return;
    racing = true;
    clear();
    shell.hidden = true;
    graphics.cancel();
    deps.launchRace(req, (outcome, perf) => {
      racing = false;
      shell.hidden = false;
      if (outcome === null) go(back);
      else go({ screen: 'results', report: career.applyOutcome(outcome) });
      safetyNet(perf);
    });
  }

  /** A race at an automatic level that ran too slowly: one level down for the next, said once. */
  function safetyNet(perf: RacePerf): void {
    if (!perf.sustainedSlow) return;
    const next = steppedDown(career.save.settings);
    if (!next) return;
    career.setSettings(next);
    const level = graphicsLevel(next).toUpperCase();
    console.info(`graphics: the race ran under the frame-rate floor; auto → ${level} for the next race`);
    const t = toast();
    // At the top: the results' buttons are at the bottom, and the next race is one tap away.
    t.el.classList.add('toast--top');
    shell.append(t.el);
    t.say(`Graphics set to ${level} for a smoother race`, true);
  }

  const ctx: AppCtx = { career, store: deps.store, audio: deps.audio, showroom: deps.showroom, graphics, go, race };
  go({ screen: 'title' });
  // While the title waits for its tap: the measurement draws on a canvas that is never shown.
  graphics.ensure();
}
