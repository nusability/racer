// Scheduled hazards: pure functions of race time, so the simulation (collisions, gusts) and
// the presentation (landmarks, warning shadows) read the same answer and can never disagree.

import type { HazardDef, Obstacle, TrackFeature } from './types.ts';
import { smoothstep } from './geom.ts';
import { mulberry32 } from './rng.ts';
import { HAZARD_BAR_RADIUS, HAZARD_BAR_SPACING, HAZARD_DROP_STAGGER, HAZARD_ROCK_HEIGHT } from '../data/tuning.ts';

/** What hazards need from the ribbon they sit on. */
export interface HazardRibbon {
  paramToS(u: number): number;
  wrap(s: number): number;
  minXAt(s: number): number;
  maxXAt(s: number): number;
}

export interface CourseHazard {
  def: HazardDef;
  /** Start and end of the hazard along s (equal for sweepers and blockers). */
  s0: number;
  s1: number;
  /** Seeds the dropper's landing spots. */
  seed: number;
  /** Drivable lateral range at s0, for blockers and droppers. */
  minX: number;
  maxX: number;
}

export function compileHazards(r: HazardRibbon, features: TrackFeature[], seed: number): CourseHazard[] {
  const out: CourseHazard[] = [];
  features.forEach((f, i) => {
    if (f.kind !== 'hazard') return;
    const d = f.hazard;
    const s0 = r.paramToS(d.type === 'sweeper' || d.type === 'blocker' ? d.at : d.from);
    const s1 = d.type === 'sweeper' || d.type === 'blocker' ? s0 : r.paramToS(d.to);
    validate(d);
    out.push({ def: d, s0, s1, seed: seed * 31 + i, minX: r.minXAt(s0), maxX: r.maxXAt(s0) });
  });
  return out;
}

function validate(d: HazardDef) {
  const fail = (why: string) => {
    throw new Error(`hazard ${d.id}: ${why}`);
  };
  if (d.period <= 0) fail('period must be positive');
  switch (d.type) {
    case 'sweeper':
      if (2 * d.cross + d.hold > d.period) fail('two crossings plus the hold must fit in the period');
      break;
    case 'dropper':
      if (d.warn + d.stay + d.count * HAZARD_DROP_STAGGER > d.period) fail('warn + stay + stagger must fit in the period');
      break;
    case 'blocker':
      if (d.warn + d.up > d.period) fail('warn + up must fit in the period');
      break;
    case 'gust':
      if (d.on > d.period) fail('on must fit in the period');
      break;
  }
}

/** Seconds into the current cycle. */
function cycleTime(time: number, period: number, phase: number): number {
  const t = (time + phase) % period;
  return t < 0 ? t + period : t;
}

/** Lateral position of a sweeper's body at race time t. */
export function sweeperX(d: Extract<HazardDef, { type: 'sweeper' }>, time: number): number {
  const t = cycleTime(time, d.period, d.phase);
  const span = d.xTo - d.xFrom;
  if (t < d.cross) return d.xFrom + span * smoothstep(t / d.cross);
  if (t < d.cross + d.hold) return d.xTo;
  if (t < 2 * d.cross + d.hold) return d.xTo - span * smoothstep((t - d.cross - d.hold) / d.cross);
  return d.xFrom;
}

export type DropStage = 'none' | 'warn' | 'down';

export interface DropItem {
  s: number;
  x: number;
  stage: DropStage;
  /** 0..1 through the current stage (warn: until impact; down: until it is cleared). */
  progress: number;
}

/** The dropper's items at race time t, written into `out` (length = count). */
export function dropperItems(h: CourseHazard, time: number, out: DropItem[]): DropItem[] {
  const d = h.def;
  if (d.type !== 'dropper') throw new Error(`hazard ${d.id} is not a dropper`);
  const shifted = time + d.phase;
  const cycle = Math.floor(shifted / d.period);
  const t = shifted - cycle * d.period;
  const rng = mulberry32((h.seed ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0);
  out.length = d.count;
  for (let i = 0; i < d.count; i++) {
    const s = h.s0 + (h.s1 - h.s0) * rng();
    const lateral = rng();
    const land = d.warn + i * HAZARD_DROP_STAGGER;
    const item = out[i] ?? { s: 0, x: 0, stage: 'none' as DropStage, progress: 0 };
    item.s = s;
    // Spots span the drivable width at the hazard's start; the course is near-constant over a dropper.
    item.x = h.minX + d.radius + (h.maxX - h.minX - 2 * d.radius) * lateral;
    if (t < land - d.warn) {
      item.stage = 'none';
      item.progress = 0;
    } else if (t < land) {
      item.stage = 'warn';
      item.progress = (t - (land - d.warn)) / d.warn;
    } else if (t < land + d.stay) {
      item.stage = 'down';
      item.progress = (t - land) / d.stay;
    } else {
      item.stage = 'none';
      item.progress = 0;
    }
    out[i] = item;
  }
  return out;
}

export type BlockerStage = 'idle' | 'warn' | 'down';

export function blockerStage(d: Extract<HazardDef, { type: 'blocker' }>, time: number): { stage: BlockerStage; progress: number } {
  const t = cycleTime(time, d.period, d.phase);
  if (t < d.warn) return { stage: 'warn', progress: t / d.warn };
  if (t < d.warn + d.up) return { stage: 'down', progress: (t - d.warn) / d.up };
  return { stage: 'idle', progress: (t - d.warn - d.up) / (d.period - d.warn - d.up) };
}

/** Lateral push (m/s²) a gust applies at race time t: eased in and out over its on-window. */
export function gustStrength(d: Extract<HazardDef, { type: 'gust' }>, time: number): number {
  const t = cycleTime(time, d.period, d.phase);
  if (t >= d.on) return 0;
  const u = t / d.on;
  return d.strength * smoothstep(u * 4) * smoothstep((1 - u) * 4);
}

const dropScratch: DropItem[] = [];

/**
 * Every obstacle the ribbon's hazards present at race time t, written into `out`. These
 * collide exactly like static obstacles (kind 'hazard', with the hazard's id).
 */
export function hazardObstacles(hazards: readonly CourseHazard[], time: number, out: Obstacle[]): Obstacle[] {
  out.length = 0;
  for (const h of hazards) {
    const d = h.def;
    switch (d.type) {
      case 'sweeper':
        out.push({ kind: 'hazard', hazardId: d.id, s: h.s0, x: sweeperX(d, time), radius: d.radius, height: d.height });
        break;
      case 'dropper':
        for (const it of dropperItems(h, time, dropScratch)) {
          if (it.stage === 'down') {
            out.push({ kind: 'hazard', hazardId: d.id, s: it.s, x: it.x, radius: d.radius, height: d.radius * HAZARD_ROCK_HEIGHT });
          }
        }
        break;
      case 'blocker': {
        if (blockerStage(d, time).stage !== 'down') break;
        // A bar across the course built from small cylinders, leaving the opening clear.
        const openMin = d.offset - d.opening / 2;
        const openMax = d.offset + d.opening / 2;
        for (let x = h.minX; x <= h.maxX; x += HAZARD_BAR_SPACING) {
          if (x + HAZARD_BAR_RADIUS > openMin && x - HAZARD_BAR_RADIUS < openMax) continue;
          out.push({ kind: 'hazard', hazardId: d.id, s: h.s0, x, radius: HAZARD_BAR_RADIUS, height: d.height });
        }
        break;
      }
      case 'gust':
        break;
    }
  }
  return out;
}

/** Total gust push (m/s²) at s on this ribbon at race time t. */
export function gustAt(hazards: readonly CourseHazard[], s: number, time: number): number {
  let push = 0;
  for (const h of hazards) {
    if (h.def.type !== 'gust') continue;
    if (s >= h.s0 && s <= h.s1) push += gustStrength(h.def, time);
  }
  return push;
}
