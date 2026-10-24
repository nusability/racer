// Contracts between the menus (src/ui), the race runtime (src/game/raceSession.ts) and the
// renderer (src/render). The race runtime is wired up in src/main.ts.

import type { PlayerInput, RaceEntrant, RaceEvent, RaceResultRow, RacerVisual } from '../core/types.ts';

/** Why a racer was wrecked out of the race. */
export type CrashReason = Extract<RaceEvent, { type: 'crash' }>['reason'];

/** How the player's race ended in a wreck, for the HUD banner and the results headline. */
export interface WreckInfo {
  reason: CrashReason;
  /** What hit them, player-facing, for 'obstacle' and 'hazard' (e.g. "A BOULDER", "SABLE ROOK"). */
  cause: string | null;
}

export type RaceMode = 'championship' | 'quick';

export interface RaceRequest {
  /** Unique per race attempt slot; the career pays each id at most once. */
  raceId: string;
  mode: RaceMode;
  trackId: string;
  laps: number;
  seed: number;
  /** The player's entrant is included (isPlayer: true). Grid order = array order, last = back. */
  entrants: RaceEntrant[];
  /** Championship only. */
  cupId?: string;
  raceIndex?: number;
}

export interface RaceOutcome {
  request: RaceRequest;
  results: RaceResultRow[];
  /** Set when the player was wrecked (their row has dnf: true); null when they finished. */
  playerWreck: WreckInfo | null;
}

/** Menus hand a race to the runtime and get the outcome back; quitting returns null. */
export type RaceLauncher = (req: RaceRequest, onDone: (outcome: RaceOutcome | null) => void) => void;

export type SteeringMode = 'drag' | 'tilt' | 'buttons';

export interface Settings {
  steering: SteeringMode;
  /** Steering sensitivity multiplier, 0.5..1.5. */
  sensitivity: number;
  sound: boolean;
  quality: 'low' | 'high';
}

/** The 3D showroom behind the garage screen (render/showroom.ts). */
export interface ShowroomApi {
  /** Shows the racer on the turntable; the menu DOM overlays the canvas. */
  show(visual: RacerVisual): void;
  hide(): void;
}

/** What the HUD draws each frame. */
export interface HudView {
  speedKmh: number;
  place: number;
  racers: number;
  lap: number; // 1-based lap the player is on (clamped to laps)
  laps: number;
  time: number;
  bestLap: number | null;
  /** Boost tank fill, 0..1. */
  boost: number;
  damage: number; // 0..1
  boosting: boolean;
  /** Slipstream drafted, 0..1. */
  draft: number;
  /** 3, 2, 1, 0 (= GO) during the start; null otherwise. */
  countdown: number | null;
  finished: boolean;
}

export interface Hud {
  update(view: HudView): void;
  /** Short centre-screen message, e.g. "LAP 2", "FINAL LAP", "SMUGGLER'S CUT". */
  flash(message: string): void;
  /** A boost cell was collected: the tank meter flashes and swells briefly. */
  pulseBoost(): void;
  /** A repair cell was collected: the hull bar flashes green. */
  pulseRepair(): void;
  /** The player is wrecked: a race-over banner that stays until dispose(). */
  wrecked(wreck: WreckInfo): void;
  dispose(): void;
}

export interface InputSource {
  read(): PlayerInput;
  dispose(): void;
}
