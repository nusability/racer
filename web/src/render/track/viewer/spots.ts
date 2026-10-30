import type { Track, Ribbon } from '../../../core/track.ts';
import { blockerStage, dropperItems, gustStrength, sweeperX, type CourseHazard, type DropItem } from '../../../core/hazards.ts';
import type { TrackFeature } from '../../../core/types.ts';
import { sceneryById } from '../../../data/tracks/index.ts';
import { landmarkName } from './names.ts';

// What the level viewer can jump to on a track (start line, loops, hazards, landmarks…) and
// what it shows about each course hazard. Read straight from the built Track and its scenery,
// so the list can never drift from what the race actually builds.

export type SpotKind =
  | 'start'
  | 'loop'
  | 'corkscrew'
  | 'jump'
  | 'kicker'
  | 'tunnel'
  | 'crossing'
  | 'boostPad'
  | 'rough'
  | 'shortcutIn'
  | 'shortcutOut'
  | 'hazard'
  | 'landmark'
  | 'street';

export interface Spot {
  kind: SpotKind;
  /** Short tag shown on the row, e.g. LOOP. */
  tag: string;
  label: string;
  /** -1 = the main loop, else a shortcut index. */
  branch: number;
  s: number;
}

export interface ViewerHazard {
  hazard: CourseHazard;
  branch: number;
  /** The middle of its stretch (droppers and gusts span one): where to look at it from. */
  s: number;
  /** Name of the landmark bound to it (the sand beast that IS the sweeper), or null. */
  landmark: string | null;
}

const TAGS: Record<SpotKind, string> = {
  start: 'START',
  loop: 'LOOP',
  corkscrew: 'CORKSCREW',
  jump: 'JUMP',
  kicker: 'KICKER',
  tunnel: 'TUNNEL',
  crossing: 'CROSSING',
  boostPad: 'BOOST PAD',
  rough: 'ROUGH',
  shortcutIn: 'SHORTCUT IN',
  shortcutOut: 'SHORTCUT OUT',
  hazard: 'HAZARD',
  landmark: 'LANDMARK',
  street: 'STREET',
};

function ribbonName(track: Track, branch: number): string {
  return branch < 0 ? 'main loop' : track.branches[branch].def.name;
}

/** Every course hazard on every ribbon, with the landmark bound to it. */
export function trackHazards(track: Track): ViewerHazard[] {
  const scenery = sceneryById(track.def.id);
  const out: ViewerHazard[] = [];
  for (const branch of [-1, ...track.branches.map((b) => b.index)]) {
    for (const hazard of track.ribbon(branch).hazards) {
      // Scenery binds landmarks to main-loop hazards only (LandmarkPlacement.hazard).
      const bound = branch < 0 ? scenery.landmarks.find((l) => l.hazard === hazard.def.id) : undefined;
      out.push({ hazard, branch, s: (hazard.s0 + hazard.s1) / 2, landmark: bound ? landmarkName(bound.kind) : null });
    }
  }
  return out;
}

function featureSpots(track: Track, branch: number, ribbon: Ribbon, features: TrackFeature[]): Spot[] {
  const where = branch < 0 ? '' : ` (${ribbonName(track, branch)})`;
  const spot = (kind: SpotKind, s: number, label: string): Spot => ({ kind, tag: TAGS[kind], label: label + where, branch, s });
  const out: Spot[] = [];
  for (const f of features) {
    switch (f.kind) {
      case 'loop':
        out.push(spot('loop', ribbon.paramToS(f.at), `Loop, radius ${f.radius} m`));
        break;
      case 'corkscrew':
        out.push(spot('corkscrew', ribbon.paramToS(f.from), `Corkscrew, ${f.turns} turn${f.turns === 1 ? '' : 's'}`));
        break;
      case 'jump':
        out.push(spot('jump', ribbon.paramToS(f.at), `Jump over a ${f.gapLength} m chasm`));
        break;
      case 'kicker':
        out.push(spot('kicker', ribbon.paramToS(f.at), `Kicker, ${f.height} m`));
        break;
      case 'tunnel': {
        const s0 = ribbon.paramToS(f.from);
        out.push(spot('tunnel', s0, `Tunnel, ${(ribbon.paramToS(f.to) - s0).toFixed(0)} m`));
        break;
      }
      case 'crossing':
        out.push(spot('crossing', ribbon.paramToS(f.at), `Crossing (${f.style}), first pass`));
        out.push(spot('crossing', ribbon.paramToS(f.other), `Crossing (${f.style}), second pass`));
        break;
      case 'boostPad':
        out.push(spot('boostPad', ribbon.paramToS(f.at), `Boost pad at ${f.lateral} m`));
        break;
      case 'rough': {
        const s0 = ribbon.paramToS(f.from);
        out.push(spot('rough', s0, `Rough ground, ${(ribbon.paramToS(f.to) - s0).toFixed(0)} m`));
        break;
      }
      default:
        // Hazards are listed from the compiled hazards, which carry their s and bound landmark;
        // the rest (dunes, walls, run-off…) shape the course but are not places to visit.
        break;
    }
  }
  return out;
}

/** Every point of interest on the track, main loop first, each ribbon in lap order. */
export function trackSpots(track: Track): Spot[] {
  const spots: Spot[] = [{ kind: 'start', tag: TAGS.start, label: 'Start / finish', branch: -1, s: 0 }];
  spots.push(...featureSpots(track, -1, track, track.def.features));
  for (const b of track.branches) {
    spots.push({ kind: 'shortcutIn', tag: TAGS.shortcutIn, label: `${b.def.name} leaves`, branch: -1, s: b.entryS });
    spots.push({ kind: 'shortcutOut', tag: TAGS.shortcutOut, label: `${b.def.name} rejoins`, branch: -1, s: b.exitS });
    spots.push(...featureSpots(track, b.index, b.ribbon, b.def.features));
  }
  for (const h of trackHazards(track)) {
    const where = h.branch < 0 ? '' : ` (${ribbonName(track, h.branch)})`;
    spots.push({ kind: 'hazard', tag: h.hazard.def.type.toUpperCase(), label: `${h.landmark ?? h.hazard.def.id}${where}`, branch: h.branch, s: h.s });
  }
  for (const l of sceneryById(track.def.id).landmarks) {
    const branch = l.branch === undefined ? -1 : track.branches.findIndex((b) => b.def.id === l.branch);
    if (branch < -1 || (l.branch !== undefined && branch < 0)) throw new Error(`landmark ${l.kind} on ${track.def.id}: no shortcut "${l.branch}"`);
    const where = branch < 0 ? '' : ` (${ribbonName(track, branch)})`;
    spots.push({ kind: 'landmark', tag: TAGS.landmark, label: `${landmarkName(l.kind)}${where}`, branch, s: track.ribbon(branch).paramToS(l.at) });
  }
  const scenery = sceneryById(track.def.id);
  if (scenery.biome === 'city') {
    for (const st of scenery.streets) spots.push({ kind: 'street', tag: TAGS.street, label: st.name, branch: -1, s: track.paramToS(st.from) });
  }
  return spots.sort((a, b) => a.branch - b.branch || a.s - b.s);
}

/**
 * How long before a hazard's cycle begins its Trigger sets the clock: the cycle starts with the
 * telegraph for blockers and droppers and with the motion for sweepers and gusts, and a second
 * of quiet first lets the eye find it before it moves.
 */
export const TRIGGER_LEAD = 1;

/** Seconds into the current cycle, as core/hazards.ts counts them. */
function cycleTime(time: number, period: number, phase: number): number {
  const t = (time + phase) % period;
  return t < 0 ? t + period : t;
}

/** The first race time at or after `now` that is TRIGGER_LEAD seconds before the hazard's cycle starts. */
export function triggerTime(h: CourseHazard, now: number): number {
  const d = h.def;
  const target = d.period - TRIGGER_LEAD;
  const wait = (target - cycleTime(now, d.period, d.phase) + d.period) % d.period;
  return now + wait;
}

const dropScratch: DropItem[] = [];

/** What the hazard is doing at race time t, in a few words. */
export function hazardState(h: CourseHazard, time: number): string {
  const d = h.def;
  switch (d.type) {
    case 'sweeper': {
      const t = cycleTime(time, d.period, d.phase);
      const x = sweeperX(d, time).toFixed(0);
      if (t < d.cross) return `crossing, x ${x} m`;
      if (t < d.cross + d.hold) return `holding, x ${x} m`;
      if (t < 2 * d.cross + d.hold) return `crossing back, x ${x} m`;
      return `parked, next in ${(d.period - t).toFixed(1)} s`;
    }
    case 'blocker': {
      const b = blockerStage(d, time);
      return b.stage === 'idle' ? `open, next in ${((1 - b.progress) * (d.period - d.warn - d.up)).toFixed(1)} s` : `${b.stage} ${(b.progress * 100).toFixed(0)}%`;
    }
    case 'dropper': {
      const items = dropperItems(h, time, dropScratch);
      const warn = items.filter((i) => i.stage === 'warn').length;
      const down = items.filter((i) => i.stage === 'down').length;
      if (warn + down === 0) return `quiet, next in ${(d.period - cycleTime(time, d.period, d.phase)).toFixed(1)} s`;
      return `${warn} falling, ${down} down`;
    }
    case 'gust': {
      const g = gustStrength(d, time);
      return g === 0 ? `calm, next in ${(d.period - cycleTime(time, d.period, d.phase)).toFixed(1)} s` : `blowing ${g.toFixed(1)} m/s²`;
    }
  }
}
