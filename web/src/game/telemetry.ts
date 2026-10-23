// Race telemetry for tuning by hand: each race's setup, the player's run sampled twice a
// second, the moments that matter (hits, wrecks, pickups, shortcuts) and the outcome. Kept on
// the device only (the last few races), exported as text from the debug menu. Nothing is sent.

import type { Race } from '../core/race.ts';
import type { PlayerInput, RaceEvent, RaceResultRow, RacerStats } from '../core/types.ts';
import type { RaceOutcome, RaceRequest, Settings } from './types.ts';
import { SIM_DT } from '../data/tuning.ts';
import {
  TELEMETRY_KEEP,
  TELEMETRY_RATE_STEER_SPEED,
  TELEMETRY_WORST_FRAMES,
  TELEMETRY_KEY,
  TELEMETRY_SAMPLE_PERIOD,
  TELEMETRY_VERSION,
} from './telemetryTuning.ts';

export interface TelemetrySample {
  /** Race time, s. */
  t: number;
  lap: number;
  place: number;
  /** Speed, km/h. */
  kmh: number;
  /** Lateral position and the ribbon (-1 main loop). */
  x: number;
  branch: number;
  /** Tank fill and hull, 0..1 (rounded). */
  boost: number;
  hull: number;
  boosting: boolean;
  offroad: boolean;
  /** Metres to the racer just ahead / just behind (null when leading / last). */
  gapAhead: number | null;
  gapBehind: number | null;
}

export interface TelemetryEvent {
  t: number;
  type: string;
  /** Who it happened to: 'you' or the rival's name. */
  who: string;
  detail?: string;
}

export interface RaceTelemetry {
  version: number;
  build: string;
  /** ISO time the race finished. */
  at: string;
  track: string;
  mode: RaceRequest['mode'];
  cup: string | null;
  laps: number;
  seed: number;
  settings: Settings;
  device: { width: number; height: number; dpr: number; ua: string };
  player: { racerId: string; stats: RacerStats };
  field: { name: string; racerId: string; skill: number; stats: RacerStats }[];
  /** Share of race time each control was in use, and how busy the steering was. */
  input: { boostHeld: number; brakeHeld: number; steerTravelPerSec: number };
  fps: { average: number; worst5pct: number };
  samples: TelemetrySample[];
  events: TelemetryEvent[];
  results: RaceResultRow[];
  wreck: RaceOutcome['playerWreck'];
}

/** Events worth a line in the log (per-step noise like scrapes is summarised instead). */
const LOGGED: ReadonlySet<RaceEvent['type']> = new Set([
  'hit',
  'crash',
  'pickup',
  'boostPad',
  'tankEmpty',
  'lap',
  'finish',
  'land',
]);

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export class TelemetryRecorder {
  private readonly request: RaceRequest;
  private readonly settings: Settings;
  private readonly build: string;
  private readonly samples: TelemetrySample[] = [];
  private readonly events: TelemetryEvent[] = [];
  private readonly frameTimes: number[] = [];
  private nextSample = 0;
  private steps = 0;
  private boostSteps = 0;
  private brakeSteps = 0;
  private steerTravel = 0;
  private scrapeSteps = 0;
  private offroad = false;

  constructor(request: RaceRequest, settings: Settings, build: string) {
    this.request = request;
    this.settings = settings;
    this.build = build;
  }

  private name(id: string): string {
    const e = this.request.entrants.find((x) => x.id === id);
    if (!e) throw new Error(`telemetry: unknown racer "${id}"`);
    return e.isPlayer ? 'you' : e.name;
  }

  /** Call after every simulation step with the input that step used and its events. */
  step(race: Race, input: PlayerInput, events: readonly RaceEvent[]) {
    if (race.phase === 'racing') {
      this.steps++;
      if (input.boost) this.boostSteps++;
      if (input.brake) this.brakeSteps++;
      // Metres the lateral target moved: drag nudges plus key/tilt rate steering.
      this.steerTravel += Math.abs(input.nudge) + Math.abs(input.steer) * TELEMETRY_RATE_STEER_SPEED * SIM_DT;
    }
    const pid = this.request.entrants.find((e) => e.isPlayer)?.id;
    for (const ev of events) {
      if (ev.type === 'scrape') {
        if (ev.id === pid) this.scrapeSteps++;
        continue;
      }
      if (ev.type === 'offroad' && ev.id === pid) this.offroad = ev.on;
      if (!LOGGED.has(ev.type) || !('id' in ev)) continue;
      // Rivals' pickups and landings would drown the log; their hits and wrecks matter.
      if (ev.id !== pid && (ev.type === 'pickup' || ev.type === 'land' || ev.type === 'boostPad' || ev.type === 'tankEmpty')) continue;
      this.events.push({ t: round(race.time, 2), type: ev.type, who: this.name(ev.id), detail: eventDetail(ev) });
    }
    if (race.phase !== 'racing' || race.time < this.nextSample) return;
    this.nextSample = race.time + TELEMETRY_SAMPLE_PERIOD;
    const p = race.player();
    const ordered = [...race.racers].sort((a, b) => a.place - b.place);
    const idx = ordered.indexOf(p);
    const ahead = ordered[idx - 1];
    const behind = ordered[idx + 1];
    this.samples.push({
      t: round(race.time, 2),
      lap: p.lap,
      place: p.place,
      kmh: Math.round(p.speed * 3.6),
      x: round(p.x, 1),
      branch: p.branch,
      boost: round(p.boost, 2),
      hull: round(1 - p.damage, 2),
      boosting: p.boosting,
      offroad: this.offroad,
      gapAhead: ahead ? Math.round(ahead.distance - p.distance) : null,
      gapBehind: behind ? Math.round(p.distance - behind.distance) : null,
    });
  }

  /** Call once per rendered frame with the real frame time, s. */
  frame(dt: number) {
    this.frameTimes.push(dt);
  }

  finish(outcome: RaceOutcome): RaceTelemetry {
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length * TELEMETRY_WORST_FRAMES)));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const player = this.request.entrants.find((e) => e.isPlayer);
    if (!player) throw new Error('telemetry: race has no player');
    const raceSeconds = this.steps * SIM_DT;
    return {
      version: TELEMETRY_VERSION,
      build: this.build,
      at: new Date().toISOString(),
      track: this.request.trackId,
      mode: this.request.mode,
      cup: this.request.cupId ?? null,
      laps: this.request.laps,
      seed: this.request.seed,
      settings: this.settings,
      device: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent },
      player: { racerId: player.racerId, stats: roundStats(player.stats) },
      field: this.request.entrants
        .filter((e) => !e.isPlayer)
        .map((e) => ({ name: e.name, racerId: e.racerId, skill: e.skill, stats: roundStats(e.stats) })),
      input: {
        boostHeld: round(this.boostSteps / Math.max(1, this.steps), 2),
        brakeHeld: round(this.brakeSteps / Math.max(1, this.steps), 2),
        steerTravelPerSec: round(this.steerTravel / Math.max(1, raceSeconds), 1),
      },
      fps: { average: Math.round(1 / Math.max(1e-3, mean(this.frameTimes))), worst5pct: Math.round(1 / Math.max(1e-3, mean(worst))) },
      samples: this.samples,
      events: [...this.events, { t: 0, type: 'wallScrapeSeconds', who: 'you', detail: String(round(this.scrapeSteps * SIM_DT, 1)) }],
      results: outcome.results,
      wreck: outcome.playerWreck,
    };
  }
}

function eventDetail(ev: RaceEvent): string | undefined {
  switch (ev.type) {
    case 'hit':
      return `${ev.kind} ${round(ev.intensity, 2)}`;
    case 'crash':
      return ev.reason;
    case 'pickup':
      return ev.item;
    case 'lap':
      return `lap ${ev.lap} ${round(ev.time, 2)}s`;
    case 'finish':
      return `P${ev.place} ${round(ev.time, 2)}s`;
    case 'land':
      return `${round(ev.impact, 1)} m/s`;
    default:
      return undefined;
  }
}

function roundStats(s: RacerStats): RacerStats {
  return {
    topSpeed: round(s.topSpeed, 1),
    accel: round(s.accel, 1),
    handling: round(s.handling, 2),
    grip: round(s.grip, 2),
    boostPower: round(s.boostPower, 3),
    boostTank: round(s.boostTank, 2),
    armor: round(s.armor, 2),
  };
}

// ---------------------------------------------------------------------------
// Storage: the last few races on this device.

export function loadTelemetry(): RaceTelemetry[] {
  const raw = localStorage.getItem(TELEMETRY_KEY);
  if (raw === null) return [];
  try {
    const list = JSON.parse(raw) as RaceTelemetry[];
    if (!Array.isArray(list)) throw new Error('not a list');
    return list.filter((t) => t.version === TELEMETRY_VERSION);
  } catch (err) {
    // Logs are a debugging aid: a corrupt store is dropped (and said so), never fatal.
    console.warn('telemetry: dropping unreadable race logs', err);
    localStorage.removeItem(TELEMETRY_KEY);
    return [];
  }
}

export function saveTelemetry(t: RaceTelemetry) {
  const list = [t, ...loadTelemetry()].slice(0, TELEMETRY_KEEP);
  localStorage.setItem(TELEMETRY_KEY, JSON.stringify(list));
}

export function clearTelemetry() {
  localStorage.removeItem(TELEMETRY_KEY);
}

export function telemetryToText(t: RaceTelemetry): string {
  return JSON.stringify(t);
}

export function telemetrySummary(t: RaceTelemetry): { track: string; when: string; place: number | null; dnf: boolean; time: number | null } {
  const me = t.results.find((r) => r.isPlayer);
  if (!me) throw new Error('telemetry: log without the player row');
  return { track: t.track, when: t.at, place: me.dnf ? null : me.place, dnf: me.dnf, time: me.time };
}
