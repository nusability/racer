// Contracts between the menus (src/ui), the race runtime (src/game/raceSession.ts) and the
// renderer (src/render). The race runtime is wired up in src/main.ts.

import type { PlayerInput, RaceEntrant, RaceEvent, RaceResultRow, RacerVisual } from '../core/types.ts';
import type { GraphicsLevel } from '../render/graphicsTuning.ts';

/** Why a racer was wrecked out of the race. */
export type CrashReason = Extract<RaceEvent, { type: 'crash' }>['reason'];

/** How the player's race ended in a wreck, for the HUD banner and the results headline. */
export interface WreckInfo {
  reason: CrashReason;
  /** What hit them last, player-facing, for 'obstacle', 'hazard' and 'destroyed' (e.g. "a boulder", "a barrier"). */
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

/** How the race ran on this device, for the graphics safety net. */
export interface RacePerf {
  /** The frame rate stayed under the safety net's floor for long enough to count (graphicsTuning.ts). */
  sustainedSlow: boolean;
}

/** Menus hand a race to the runtime and get the outcome back; quitting returns null. */
export type RaceLauncher = (req: RaceRequest, onDone: (outcome: RaceOutcome | null, perf: RacePerf) => void) => void;

export type SteeringMode = 'drag' | 'tilt' | 'buttons';

export interface Settings {
  steering: SteeringMode;
  /** Steering sensitivity multiplier, 0.5..1.5. */
  sensitivity: number;
  sound: boolean;
  /** A level the player picked, or 'auto': the benchmark's pick. */
  graphics: GraphicsChoice;
  /** The last benchmark on this device; null until one has finished. */
  benchmark: GraphicsBenchmark | null;
}

export type GraphicsChoice = GraphicsLevel | 'auto';

export interface GraphicsBenchmark {
  /** What 'auto' runs at: the measured level, or lower once the in-race safety net stepped it down. */
  level: GraphicsLevel;
  /** The level the measurement itself picked. */
  measured: GraphicsLevel;
  /** Median ms per frame of the benchmark scene ... */
  ms: number;
  /** ... or, when true, the device was cut off as clearly low and `ms` is a lower bound. */
  lowerBound: boolean;
  /** The build and GPU it ran on: a change of either measures again. */
  build: string;
  gpu: string;
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
  /** How far into the race the player is: lap n of a circuit, or sector n of a sprint (1-based, clamped to `of`). */
  stage: { kind: 'lap' | 'sector'; n: number; of: number };
  time: number;
  /** Best lap so far on a circuit; null on a sprint, whose one run is the race time. */
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
  /** Short centre-screen message, e.g. "LAP 2", "FINAL LAP", "SECTOR 3", "SMUGGLER'S CUT". */
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
