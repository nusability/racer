// What every screen gets: the career, audio, showroom, navigation and the race launcher.
import type { GameAudio } from '../../audio/audio.ts';
import type { Career, RaceReport } from '../../game/career.ts';
import type { KeyValueStore } from '../../game/save.ts';
import type { RaceRequest, ShowroomApi } from '../../game/types.ts';

export type Nav =
  | { screen: 'title' }
  | { screen: 'menu' }
  | { screen: 'championship' }
  | { screen: 'world'; worldId: string }
  | { screen: 'cup'; cupId: string }
  | { screen: 'quick'; worldId?: string; trackId?: string; laps?: number }
  | { screen: 'garage'; racerId?: string }
  | { screen: 'settings' }
  | { screen: 'debug' }
  | { screen: 'results'; report: RaceReport };

export interface AppCtx {
  career: Career;
  /** Where the career and the per-device debug flags live. */
  store: KeyValueStore;
  audio: GameAudio;
  showroom: ShowroomApi;
  go(nav: Nav): void;
  /** Hands the race to the runtime; quitting returns to `back`. */
  race(req: RaceRequest, back: Nav): void;
}

export interface Screen {
  el: HTMLElement;
  /** Background: 'sunset' paints the menu backdrop, 'showroom' leaves the 3D canvas visible. */
  backdrop: 'sunset' | 'showroom';
  dispose?(): void;
}
