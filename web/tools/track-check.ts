// Builds every track headless and prints its shape plus the checks authors design against:
// corner radii, jump clear speeds, flight paths that hit something, and features that
// contradict each other. Exit code 1 when any check warns.
import { TRACKS } from '../src/data/tracks/index.ts';
import { Track } from '../src/core/track.ts';
import type { TrackDef, TrackFeature } from '../src/core/types.ts';
import { GRAVITY } from '../src/data/tuning.ts';

/** Every jump must be cleared by a racer slowed to this, with margin. */
const JUMP_CLEAR_TARGET = 100;
/** Warn when a jump needs more than this fraction of the target to clear. */
const JUMP_CLEAR_MARGIN = 0.9;
/** Fastest racer we plan for (upgraded + boost), m/s. */
const TOP_SPEED = 240;
/** Starter top speed, used for the lap-time estimate. */
const STARTER_SPEED = 150;
const MIN_RADIUS = 70;
/** Radius under which a corner needs braking; listed so authors see them. */
const BRAKING_RADIUS = 150;
/** A braking corner ends once the radius opens past this multiple, so wobbles don't split it. */
const CORNER_EXIT = 1.3;
/** A jump landing run-out should be at least this gentle. */
const RUNOUT_MIN_RADIUS = 300;
const MIN_WIDTH = 12;
const LAP_MIN = 6000;
const LAP_MAX = 10000;
/** Non-adjacent parts of the lap closer than this (horizontally) would share scenery. */
const MIN_SEPARATION = 160;
/** Two samples count as adjacent along the lap when this close in s. */
const ADJACENT_S = 600;
/** Clearance a racer needs under a ceiling or lintel while airborne, metres. */
const HEAD_ROOM = 3;
/** How far below the far edge of a chasm a racer can arrive and still scramble on, metres. */
const LANDING_TOLERANCE = 1;
/** Integration step of the flight check, metres along s. */
const FLIGHT_STEP = 1;

interface Flight {
  landed: boolean;
  /** Distance from launch to touchdown (or to the fall), metres. */
  distance: number;
  apex: number;
  /** First problem met in the air, or null. */
  hit: string | null;
}

/** Ballistic flight in track space from s0 with road-relative vertical speed vy. */
function fly(t: Track, launch: number, speed: number, vy: number): Flight {
  // Launch from the last surface sample: interpolating at a lip would blend in the chasm.
  let k = Math.floor(t.wrap(launch) / t.step);
  while (t.samples[k].gap) k = (k - 1 + t.samples.length) % t.samples.length;
  const s0 = t.samples[k].s;
  const y0 = t.samples[k].pos.y;
  let apex = 0;
  let overGap = false;
  for (let d = FLIGHT_STEP; d < 5000; d += FLIGHT_STEP) {
    const time = d / speed;
    const y = y0 + vy * time - 0.5 * GRAVITY * time * time;
    const s = t.wrap(s0 + d);
    const road = t.elevationAt(s);
    apex = Math.max(apex, y - y0);
    const over = y - road;
    if (t.isGap(s)) {
      overGap = true;
      if (y < t.chasmFloorAt(s)) return { landed: false, distance: d, apex, hit: null };
      continue;
    }
    // Coming out of a chasm below the far edge means hitting its face, not landing.
    if (overGap && over < -LANDING_TOLERANCE) return { landed: false, distance: d, apex, hit: null };
    overGap = false;
    if (over <= 0) return { landed: true, distance: d, apex, hit: null };
    if (over > t.ceilingAt(s) - HEAD_ROOM) return { landed: false, distance: d, apex, hit: `ceiling at s=${s.toFixed(0)}` };
    for (const a of t.arches) {
      if (Math.abs(t.delta(s, a.s)) < FLIGHT_STEP && over > a.height - HEAD_ROOM) {
        return { landed: false, distance: d, apex, hit: `arch lintel at s=${a.s.toFixed(0)}` };
      }
    }
  }
  return { landed: false, distance: 5000, apex, hit: 'never lands' };
}

/** Lowest speed that lands beyond the gap, by bisection. */
function minClearSpeed(t: Track, lip: number, slope: number): number {
  let lo = 5;
  let hi = 600;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const f = fly(t, lip, mid, mid * slope);
    if (f.landed) hi = mid;
    else lo = mid;
  }
  return hi;
}

function minRadiusBetween(t: Track, s0: number, len: number): number {
  let k = 0;
  for (let d = 0; d <= len; d += t.step) k = Math.max(k, Math.abs(t.curvatureAt(s0 + d)));
  return k === 0 ? Infinity : 1 / k;
}

function check(def: TrackDef): string[] {
  const warn: string[] = [];
  const t = new Track(def);
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : 'inf');
  const sAt = (u: number) => t.paramToS(u);
  /** Inverse of paramToS, so warnings speak the authors' coordinates. */
  const uAt = (s: number) => {
    const n = def.points.length;
    for (let i = 0; i < n; i++) {
      const a = sAt(i);
      const b = sAt(i + 1);
      if (s >= a && s <= b) return i + (s - a) / (b - a);
    }
    return n;
  };
  const inRange = (s: number, from: number, to: number) => {
    const a = sAt(from);
    const len = t.wrap(sAt(to) - a);
    return t.wrap(s - a) <= len;
  };

  // Shape.
  let maxCurv = 0;
  let maxCurvS = 0;
  for (const smp of t.samples) {
    if (Math.abs(smp.curvature) > maxCurv) {
      maxCurv = Math.abs(smp.curvature);
      maxCurvS = smp.s;
    }
  }
  const elev = t.samples.map((s) => s.pos.y);
  const minWidth = Math.min(...t.samples.map((s) => s.width));
  const maxSlope = Math.max(...t.samples.filter((s) => !s.gap).map((s) => Math.abs(s.slope)));
  const startR = minRadiusBetween(t, t.length - 100, 300);
  console.log(
    `\n${def.id} "${def.name}" d${def.difficulty} ${def.laps} laps  len ${fmt(t.length)}m  ` +
      `lap@${STARTER_SPEED} ${(t.length / STARTER_SPEED).toFixed(0)}s  minRadius ${fmt(1 / maxCurv)}m @${uAt(maxCurvS).toFixed(2)}  ` +
      `elev ${fmt(Math.min(...elev))}..${fmt(Math.max(...elev))}  maxSlope ${maxSlope.toFixed(2)}  minWidth ${minWidth.toFixed(1)}  ` +
      `obstacles ${t.obstacles.length} arches ${t.arches.length} pads ${t.boostPads.length}`,
  );
  if (t.length < LAP_MIN || t.length > LAP_MAX) warn.push(`lap length ${fmt(t.length)} outside ${LAP_MIN}..${LAP_MAX}`);
  if (1 / maxCurv < MIN_RADIUS) warn.push(`radius ${fmt(1 / maxCurv)}m < ${MIN_RADIUS}m at @${uAt(maxCurvS).toFixed(2)}`);
  if (startR < RUNOUT_MIN_RADIUS) warn.push(`start line not on a straight (radius ${fmt(startR)}m)`);
  if (minWidth < MIN_WIDTH) warn.push(`width ${minWidth.toFixed(1)} < ${MIN_WIDTH}`);

  // Braking corners: contiguous runs under BRAKING_RADIUS.
  let inCorner = false;
  let cornerMin = Infinity;
  for (let k = 0; k <= t.samples.length; k++) {
    const smp = t.samples[k % t.samples.length];
    const r = 1 / Math.abs(smp.curvature);
    if (r < BRAKING_RADIUS) {
      inCorner = true;
      cornerMin = Math.min(cornerMin, r);
    } else if (inCorner && r > BRAKING_RADIUS * CORNER_EXIT) {
      console.log(`  braking corner ending @${uAt(smp.s).toFixed(2)} min radius ${fmt(cornerMin)}m`);
      inCorner = false;
      cornerMin = Infinity;
    }
  }

  // Jumps.
  for (const j of t.jumps) {
    const f = def.features.find((x) => x.kind === 'jump' && Math.abs(sAt(x.at) - j.rampStart) < 1) as Extract<TrackFeature, { kind: 'jump' }>;
    const slope = (2 * f.rampHeight) / f.rampLength;
    const vmin = minClearSpeed(t, j.lip, slope);
    const fast = fly(t, j.lip, TOP_SPEED, TOP_SPEED * slope);
    const runout = minRadiusBetween(t, j.rampStart, t.wrap(j.lip + fast.distance + 100 - j.rampStart));
    console.log(
      `  jump @${f.at} s=${fmt(j.lip)} gap ${f.gapLength}m ramp ${f.rampHeight}/${f.rampLength} lip slope ${slope.toFixed(2)}: ` +
        `min clear ${vmin.toFixed(0)} m/s (${(vmin * 3.6).toFixed(0)} km/h); @${TOP_SPEED}: flies ${fmt(fast.distance)}m apex ${fast.apex.toFixed(0)}m; ` +
        `ramp..run-out min radius ${fmt(runout)}m`,
    );
    if (vmin > JUMP_CLEAR_TARGET * JUMP_CLEAR_MARGIN) warn.push(`jump @${f.at} needs ${vmin.toFixed(0)} m/s (> ${JUMP_CLEAR_TARGET * JUMP_CLEAR_MARGIN})`);
    if (runout < RUNOUT_MIN_RADIUS) warn.push(`jump @${f.at} ramp/run-out curves (radius ${fmt(runout)}m)`);
    for (const v of [vmin * 1.05, JUMP_CLEAR_TARGET, STARTER_SPEED, TOP_SPEED]) {
      const fl = fly(t, j.lip, v, v * slope);
      if (fl.hit) warn.push(`jump @${f.at} at ${v.toFixed(0)} m/s: ${fl.hit}`);
    }
    for (const o of t.obstacles) {
      const d = t.delta(j.rampStart, o.s);
      if (d > 0 && d < j.lip - j.rampStart + fast.distance + 60) warn.push(`jump @${f.at}: ${o.kind} at s=${fmt(o.s)} on ramp/flight/landing`);
    }
  }

  // Kickers and dunes: flights that hit things.
  for (const f of def.features) {
    if (f.kind === 'kicker') {
      const top = t.wrap(sAt(f.at) + f.length);
      const slope = (2 * f.height) / f.length;
      const parts: string[] = [];
      for (const v of [STARTER_SPEED, TOP_SPEED]) {
        const fl = fly(t, top, v, v * slope);
        parts.push(`@${v}: ${fmt(fl.distance)}m apex ${fl.apex.toFixed(0)}m`);
        if (fl.hit) warn.push(`kicker @${f.at} at ${v} m/s: ${fl.hit}`);
        if (!fl.landed && !fl.hit) warn.push(`kicker @${f.at} at ${v} m/s lands in a chasm`);
      }
      console.log(`  kicker @${f.at} ${f.height}/${f.length} slope ${slope.toFixed(2)}  ${parts.join('  ')}`);
    }
    if (f.kind === 'tunnel') {
      for (const g of def.features) {
        if ((g.kind === 'jump' || g.kind === 'kicker') && inRange(sAt(g.at), f.from, f.to)) {
          warn.push(`${g.kind} @${g.at} inside tunnel ${f.from}..${f.to}`);
        }
        if (g.kind === 'arch' && inRange(sAt(g.at), f.from, f.to)) warn.push(`arch @${g.at} inside tunnel`);
        if (g.kind === 'dunes' && g.amplitude * 2 > f.ceiling / 3 && (inRange(sAt(g.from), f.from, f.to) || inRange(sAt(f.from), g.from, g.to))) {
          warn.push(`dunes ${g.from}..${g.to} under tunnel ceiling ${f.ceiling}`);
        }
      }
    }
    if (f.kind === 'arch') {
      const s = sAt(f.at);
      const half = t.widthAt(s) / 2;
      if (f.offset - f.opening / 2 < -half || f.offset + f.opening / 2 > half) warn.push(`arch @${f.at} opening leaves the road`);
      if (t.isGap(s)) warn.push(`arch @${f.at} over a chasm`);
    }
    if (f.kind === 'pillar' || f.kind === 'boostPad') {
      const s = sAt(f.at);
      if (t.isGap(s)) warn.push(`${f.kind} @${f.at} in a chasm`);
      if (Math.abs(f.lateral) > t.widthAt(s) / 2) warn.push(`${f.kind} @${f.at} off the road`);
    }
  }
  for (const o of t.obstacles) {
    if (t.isGap(o.s)) warn.push(`${o.kind} at s=${fmt(o.s)} in a chasm`);
  }

  // Parts of the lap that pass close to each other.
  const st = 5;
  for (let a = 0; a < t.samples.length; a += st) {
    for (let b = a + st; b < t.samples.length; b += st) {
      const sa = t.samples[a];
      const sb = t.samples[b];
      if (Math.abs(t.delta(sa.s, sb.s)) < ADJACENT_S) continue;
      const d = Math.hypot(sa.pos.x - sb.pos.x, sa.pos.z - sb.pos.z);
      if (d < MIN_SEPARATION) {
        warn.push(`s=${fmt(sa.s)} and s=${fmt(sb.s)} only ${fmt(d)}m apart`);
        b = t.samples.length;
        a += 50;
      }
    }
  }
  for (const w of warn) console.log(`  WARN ${w}`);
  return warn;
}

// Node global; the tools share the browser tsconfig, which has no Node typings.
declare const process: { exitCode: number };

let warnings = 0;
for (const def of TRACKS) warnings += check(def).length;
console.log(`\n${TRACKS.length} tracks, ${warnings} warnings`);
process.exitCode = warnings > 0 ? 1 : 0;
