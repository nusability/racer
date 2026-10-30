// The "layout character" of a course: what makes it exciting to drive, measured on its main road.
// Info only for now (track-check prints it against the targets below); the per-world layout work
// raises the targets to rules. Every number comes from the real track and the real handling.
//
// - direction changes per km: corners (radius under CORNER_RADIUS) that turn the other way from
//   the one before; chicanes: such a pair within CHICANE_GAP of each other, both tighter than
//   CHICANE_RADIUS.
// - longest straight: radius over STRAIGHT_RADIUS all the way.
// - full throttle: share of the lap an ideal line (the stock starter at its cornering limit,
//   boosting wherever it can, braking as late as it can) spends neither braking nor held to a
//   corner's limit.
// - brake zones: where that ideal line must shed more than BRAKE_ZONE_DROP of its speed.
// - crests before corners: crests that leave the ideal line under CREST_LIGHT of its grip with
//   a corner (radius under CORNER_RADIUS) starting within CREST_CORNER_REACH.
// - elevation range and climb (metres per km of climbing), loops and corkscrews left out.

import type { Ribbon } from '../src/core/track.ts';
import { cornerLimit, crestGripAt, roadLoadRaw, steerRate } from '../src/core/handling.ts';
import { racerById } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { ACCEL_TAPER_EXP, BOOST_ACCEL_MULT, BRAKE_DECEL, CORNER_PULL, GRIP_REF } from '../src/data/tuning.ts';

const CORNER_RADIUS = 600;
const STRAIGHT_RADIUS = 1500;
const CHICANE_RADIUS = 300;
const CHICANE_GAP = 150;
const BRAKE_ZONE_DROP = 0.1;
const CREST_LIGHT = 0.5;
const CREST_CORNER_REACH = 200;
/** The ideal line's glider: the stock starter the hull and lap targets are written for. */
const IDEAL_RACER = 'dustwing';
/** A sample counts as held below full throttle when it is this much under what accelerating would give, m/s. */
const SPEED_EPS = 0.05;

export interface LayoutCharacter {
  turnsPerKm: number;
  chicanes: number;
  longestStraight: number;
  fullThrottle: number;
  brakeZones: number;
  crestsBeforeCorners: number;
  elevationRange: number;
  climbPerKm: number;
}

/**
 * Targets an exciting layout meets (per lap; a sprint per 10 km of race): reported, not yet
 * enforced. [comparison, value]: '>=' a floor, '<=' a ceiling.
 */
export const LAYOUT_TARGETS: Record<keyof LayoutCharacter, ['>=' | '<=', number]> = {
  turnsPerKm: ['>=', 1.2],
  chicanes: ['>=', 2],
  longestStraight: ['<=', 1500],
  fullThrottle: ['<=', 0.8],
  brakeZones: ['>=', 4],
  crestsBeforeCorners: ['>=', 1],
  elevationRange: ['>=', 30],
  climbPerKm: ['>=', 8],
};

/** Metres of race distance the per-lap counts are given for on a sprint. */
const SPRINT_UNIT = 10000;

/** The ideal line's speed per sample (see the header), and whether it is braking there. */
export function idealLine(r: Ribbon): { v: Float64Array; braking: Uint8Array; held: Uint8Array } {
  const stats = effectiveStats(racerById(IDEAL_RACER), noUpgrades());
  const n = r.samples.length;
  const budget = (steerRate(stats) * stats.grip) / (CORNER_PULL * GRIP_REF);
  // Flat out is on boost: the tank is assumed to last (cells and pads keep it topped up).
  const top = stats.topSpeed * (1 + stats.boostPower);
  const limit = Float64Array.from(r.samples, (p, k) => Math.min(top, cornerLimit(Math.abs(p.curvature), budget * p.grip, crestGripAt(r, k))));
  const passes = r.closed ? 2 : 1;
  const accel = (v: number) => {
    const a = stats.accel * BOOST_ACCEL_MULT * (1 - (v / top) ** ACCEL_TAPER_EXP);
    return Math.sqrt(v * v + 2 * a * r.step);
  };
  // Forward: accelerate, capped by each sample's limit.
  const fwd = Float64Array.from(limit);
  for (let pass = 0; pass < passes; pass++) {
    for (let k = 1; k <= n - (r.closed ? 0 : 1); k++) {
      const i = k % n;
      fwd[i] = Math.min(limit[i], accel(fwd[k - 1]));
    }
  }
  // Backward: brake as late as possible into every limit.
  const v = Float64Array.from(fwd);
  for (let pass = 0; pass < passes; pass++) {
    for (let k = n - 2 + (r.closed ? 1 : 0); k >= 0; k--) {
      v[k] = Math.min(v[k], Math.sqrt(v[(k + 1) % n] ** 2 + 2 * BRAKE_DECEL * r.step));
    }
  }
  const braking = new Uint8Array(n);
  const held = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    braking[k] = v[k] < fwd[k] - SPEED_EPS ? 1 : 0;
    const prev = r.closed ? v[(k - 1 + n) % n] : k > 0 ? v[k - 1] : 0;
    held[k] = braking[k] || (k > 0 && v[k] < Math.min(top, accel(prev)) - SPEED_EPS) ? 1 : 0;
  }
  return { v, braking, held };
}

export function layoutCharacter(r: Ribbon, raceLength: number, sprint: boolean): LayoutCharacter {
  const smp = r.samples;
  const n = smp.length;
  const perLap = sprint ? raceLength / SPRINT_UNIT : 1;
  // Corners: runs of one sign tighter than CORNER_RADIUS.
  const corners: { k0: number; k1: number; sign: number; minR: number }[] = [];
  let cur: (typeof corners)[number] | null = null;
  for (let k = 0; k < n; k++) {
    const c = smp[k].curvature;
    const sign = Math.abs(c) >= 1 / CORNER_RADIUS && !smp[k].magnet ? Math.sign(c) : 0;
    if (cur && sign === cur.sign) {
      cur.k1 = k;
      cur.minR = Math.min(cur.minR, 1 / Math.abs(c));
    } else {
      cur = sign === 0 ? null : { k0: k, k1: k, sign, minR: 1 / Math.abs(c) };
      if (cur) corners.push(cur);
    }
  }
  let turns = 0;
  let chicanes = 0;
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    if (a.sign === b.sign) continue;
    turns++;
    if ((b.k0 - a.k1) * r.step <= CHICANE_GAP && a.minR <= CHICANE_RADIUS && b.minR <= CHICANE_RADIUS) chicanes++;
  }
  let longest = 0;
  let run = 0;
  for (let k = 0; k < (r.closed ? 2 * n : n); k++) {
    const p = smp[k % n];
    run = Math.abs(p.curvature) < 1 / STRAIGHT_RADIUS && !p.magnet ? run + r.step : 0;
    longest = Math.max(longest, Math.min(run, r.length));
  }
  const line = idealLine(r);
  let heldCount = 0;
  let zones = 0;
  for (let k = 0; k < n; k++) {
    if (line.held[k]) heldCount++;
    // A brake zone starts where braking starts; it counts when it sheds enough speed.
    if (line.braking[k] && !line.braking[(k - 1 + n) % n]) {
      let j = k;
      while (line.braking[(j + 1) % n] && j - k < n) j++;
      const entry = line.v[k];
      const low = line.v[(j + 1) % n];
      if ((entry - low) / entry > BRAKE_ZONE_DROP) zones++;
    }
  }
  let crests = 0;
  let inCrest = false;
  for (let k = 0; k < n; k++) {
    const light = !smp[k].magnet && !smp[k].gap && roadLoadRaw(line.v[k], smp[k].vcurve) < CREST_LIGHT;
    if (light && !inCrest) {
      for (let d = 0; d * r.step <= CREST_CORNER_REACH; d++) {
        const q = r.closed ? (k + d) % n : Math.min(n - 1, k + d);
        if (Math.abs(smp[q].curvature) >= 1 / CORNER_RADIUS) {
          crests++;
          break;
        }
      }
    }
    inCrest = light;
  }
  const ys = smp.filter((p) => !p.magnet && !p.gap).map((p) => p.pos.y);
  let climb = 0;
  for (let k = 1; k < n; k++) if (!smp[k].magnet && !smp[k - 1].magnet && !smp[k].gap && !smp[k - 1].gap) climb += Math.max(0, smp[k].pos.y - smp[k - 1].pos.y);
  return {
    turnsPerKm: turns / (r.length / 1000),
    chicanes: chicanes / perLap,
    longestStraight: longest,
    fullThrottle: 1 - heldCount / n,
    brakeZones: zones / perLap,
    crestsBeforeCorners: crests / perLap,
    elevationRange: Math.max(...ys) - Math.min(...ys),
    climbPerKm: climb / (r.length / 1000),
  };
}

/** Which targets a layout misses, by name. */
export function missedTargets(c: LayoutCharacter): (keyof LayoutCharacter)[] {
  return (Object.keys(LAYOUT_TARGETS) as (keyof LayoutCharacter)[]).filter((k) => {
    const [cmp, value] = LAYOUT_TARGETS[k];
    return cmp === '>=' ? c[k] < value : c[k] > value;
  });
}
