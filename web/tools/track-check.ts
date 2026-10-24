// Builds every track headless and prints its shape plus the checks authors design against:
// corner radii, widths, jump clear speeds, flight paths that hit something, whether every
// obstacle leaves an open way round, shortcut sanity and saving, and parts of the course that
// crowd each other. Exit code 1 when any check warns.
import { TRACKS, sceneryById } from '../src/data/tracks/index.ts';
import { worldOfTrack } from '../src/data/worlds.ts';
import { SEA_LEVEL } from '../src/render/track/config.ts';
import { Ribbon, Track, type Branch } from '../src/core/track.ts';
import { Race } from '../src/core/race.ts';
import { AiDriver, type AiOptions } from '../src/core/ai.ts';
import { racerById } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import type { PlayerInput, TrackDef, TrackFeature } from '../src/core/types.ts';
import { BRANCH_JUNCTION_LENGTH, CROSSING_BRIDGE_CLEARANCE, GRAVITY, SIM_DT } from '../src/data/tuning.ts';

/** Every jump must be cleared by a racer slowed to this, with margin. */
const JUMP_CLEAR_TARGET = 100;
/** Warn when a jump needs more than this fraction of the target to clear. */
const JUMP_CLEAR_MARGIN = 0.9;
/** Fastest racer we plan for (upgraded + boost), m/s. */
const TOP_SPEED = 240;
/** Starter top speed, used for the lap-time estimate. */
const STARTER_SPEED = 150;
/** Typical racing speed, used to turn a shortcut's distance saving into seconds. */
const RACE_SPEED = 170;
const MIN_RADIUS = 70;
/** Radius under which a corner needs braking; listed so authors see them. */
const BRAKING_RADIUS = 150;
/** A braking corner ends once the radius opens past this multiple, so wobbles don't split it. */
const CORNER_EXIT = 1.3;
/** A jump landing run-out should be at least this gentle. */
const RUNOUT_MIN_RADIUS = 300;
/** A beach road must sit this far above the sea so the swell never washes over it. */
const SEA_CLEARANCE = 0.6;
/** Narrowest walled main road (canyon, tunnel, squeeze) and narrowest shortcut. */
const MIN_WIDTH = 18;
/** Walled main-road sections narrower than this must be short squeezes. */
const WALLED_WIDTH = 26;
const SQUEEZE_MAX = 260;
const BRANCH_WIDTH: [number, number] = [16, 22];
const LAP_MIN = 6000;
const LAP_MAX = 10000;
/** Gap between the hard boundaries of non-adjacent parts of the course, metres. */
const MIN_CLEARANCE = 40;
/** Two samples count as adjacent along a ribbon when this close in s. */
const ADJACENT_S = 700;
/** Clearance a racer needs under a ceiling or lintel while airborne, metres. */
const HEAD_ROOM = 3;
/** How far below the far edge of a chasm a racer can arrive and still scramble on, metres. */
const LANDING_TOLERANCE = 1;
/** Integration step of the flight check, metres along s. */
const FLIGHT_STEP = 1;
/** Nothing solid within this after a landing or a kicker touchdown. */
const LANDING_CLEAR = 150;
/** Every obstacle must leave a free lane at least this wide somewhere across the course. */
const OPEN_LANE = 16;
/** Past a junction a branch is still peeling away from the main road for this long. */
const DIVERGE = 320;
/** Shortcuts are the risky line: a tighter free lane is enough there. */
const BRANCH_LANE = 8;

interface Flight {
  landed: boolean;
  /** Distance from launch to touchdown (or to the fall), metres. */
  distance: number;
  apex: number;
  /** First problem met in the air, or null. */
  hit: string | null;
}

/** Ballistic flight in track space from s0 with road-relative vertical speed vy. */
function fly(t: Ribbon, launch: number, speed: number, vy: number): Flight {
  // Launch from the last surface sample: interpolating at a lip would blend in the chasm.
  const n = t.samples.length;
  let k = Math.min(n - 1, Math.floor(t.wrap(launch) / t.step));
  while (t.samples[k].gap) k = (k - 1 + n) % n;
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
    if (!t.closed && s >= t.length) return { landed: true, distance: d, apex, hit: 'lands past the end of the branch' };
  }
  return { landed: false, distance: 5000, apex, hit: 'never lands' };
}

/**
 * Lowest speed that lands beyond the gap. Scanned upward rather than bisected: past a certain
 * speed a racer can sail into the next chasm, so "lands" is not monotonic in speed.
 */
function minClearSpeed(t: Ribbon, lip: number, slope: number): number {
  for (let v = 5; v < 600; v += 0.5) if (fly(t, lip, v, v * slope).landed) return v;
  return Infinity;
}

function minRadiusBetween(t: Ribbon, s0: number, len: number): number {
  let k = 0;
  for (let d = 0; d <= len; d += t.step) k = Math.max(k, Math.abs(t.curvatureAt(s0 + d)));
  return k === 0 ? Infinity : 1 / k;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : 'inf');

/** Checks shared by the main loop and every branch. `quiet` spans (junctions) get no features. */
function checkRibbon(t: Ribbon, features: TrackFeature[], pointCount: number, label: string, warn: string[], isMain: boolean) {
  const w = (m: string) => warn.push(`${label}: ${m}`);
  const sAt = (u: number) => t.paramToS(u);
  const uAt = (s: number) => {
    for (let i = 0; i < pointCount - (t.closed ? 0 : 1); i++) {
      const a = sAt(i);
      const b = sAt(i + 1);
      if (s >= a && s <= b) return i + (s - a) / (b - a);
    }
    return pointCount;
  };
  const inRange = (s: number, from: number, to: number) => {
    const a = sAt(from);
    return t.wrap(s - a) <= t.wrap(sAt(to) - a);
  };

  let maxCurv = 0;
  let maxCurvS = 0;
  for (const smp of t.samples) {
    if (Math.abs(smp.curvature) > maxCurv) {
      maxCurv = Math.abs(smp.curvature);
      maxCurvS = smp.s;
    }
  }
  const elev = t.samples.map((s) => s.pos.y);
  const maxSlope = Math.max(...t.samples.filter((s) => !s.gap && !s.magnet).map((s) => Math.abs(s.slope)));
  const runoffs = t.samples.map((s) => Math.min(s.edgeL, s.edgeR) - s.width / 2);
  console.log(
    `  ${label}: len ${fmt(t.length)}m  minRadius ${fmt(1 / maxCurv)}m @${uAt(maxCurvS).toFixed(2)}  ` +
      `elev ${fmt(Math.min(...elev))}..${fmt(Math.max(...elev))}  maxSlope ${maxSlope.toFixed(2)}  ` +
      `width ${fmt(Math.min(...t.samples.map((s) => s.width)))}..${fmt(Math.max(...t.samples.map((s) => s.width)))}  ` +
      `run-off ${fmt(Math.min(...runoffs))}..${fmt(Math.max(...runoffs))}  ` +
      `obstacles ${t.obstacles.length} arches ${t.arches.length} pads ${t.boostPads.length} jumps ${t.jumps.length}`,
  );
  if (1 / maxCurv < MIN_RADIUS) w(`radius ${fmt(1 / maxCurv)}m < ${MIN_RADIUS}m at @${uAt(maxCurvS).toFixed(2)}`);

  // Widths: walled main road stays generous except in short squeezes.
  let squeeze = 0;
  for (const smp of t.samples) {
    if (smp.width < MIN_WIDTH - 0.01) w(`width ${smp.width.toFixed(1)} < ${MIN_WIDTH} at s=${fmt(smp.s)}`);
    const walled = smp.edgeL - smp.width / 2 < 1 && smp.edgeR - smp.width / 2 < 1;
    if (isMain && walled && smp.width < WALLED_WIDTH - 0.01) {
      squeeze += t.step;
      if (squeeze > SQUEEZE_MAX) {
        w(`walled squeeze under ${WALLED_WIDTH}m runs past ${SQUEEZE_MAX}m at s=${fmt(smp.s)}`);
        squeeze = -Infinity;
      }
    } else if (squeeze > 0) squeeze = 0;
  }

  let inCorner = false;
  let cornerMin = Infinity;
  for (let k = 0; k < t.samples.length; k++) {
    const smp = t.samples[k];
    const r = 1 / Math.abs(smp.curvature);
    if (r < BRAKING_RADIUS) {
      inCorner = true;
      cornerMin = Math.min(cornerMin, r);
    } else if (inCorner && r > BRAKING_RADIUS * CORNER_EXIT) {
      console.log(`    braking corner ending @${uAt(smp.s).toFixed(2)} min radius ${fmt(cornerMin)}m`);
      inCorner = false;
      cornerMin = Infinity;
    }
  }

  // Jumps.
  const clearZones: [number, number, string][] = [];
  for (const j of t.jumps) {
    const f = features.find((x) => x.kind === 'jump' && Math.abs(sAt(x.at) - j.rampStart) < 1) as Extract<TrackFeature, { kind: 'jump' }>;
    const slope = (2 * f.rampHeight) / f.rampLength;
    const vmin = minClearSpeed(t, j.lip, slope);
    const fast = fly(t, j.lip, TOP_SPEED, TOP_SPEED * slope);
    const runout = minRadiusBetween(t, j.rampStart, t.wrap(j.lip + fast.distance + 100 - j.rampStart));
    console.log(
      `    jump @${f.at} gap ${f.gapLength}m ramp ${f.rampHeight}/${f.rampLength} lip ${slope.toFixed(2)}: ` +
        `min clear ${vmin.toFixed(0)} m/s (${(vmin * 3.6).toFixed(0)} km/h); @${TOP_SPEED}: ${fmt(fast.distance)}m apex ${fast.apex.toFixed(0)}m; ` +
        `run-out radius ${fmt(runout)}m`,
    );
    if (vmin > JUMP_CLEAR_TARGET * JUMP_CLEAR_MARGIN) w(`jump @${f.at} needs ${vmin.toFixed(0)} m/s (> ${JUMP_CLEAR_TARGET * JUMP_CLEAR_MARGIN})`);
    if (runout < RUNOUT_MIN_RADIUS) w(`jump @${f.at} ramp/run-out curves (radius ${fmt(runout)}m)`);
    for (const v of [vmin * 1.05, JUMP_CLEAR_TARGET, STARTER_SPEED, TOP_SPEED]) {
      const fl = fly(t, j.lip, v, v * slope);
      if (fl.hit) w(`jump @${f.at} at ${v.toFixed(0)} m/s: ${fl.hit}`);
    }
    clearZones.push([j.rampStart, j.lip - j.rampStart + fast.distance + LANDING_CLEAR, `jump @${f.at}`]);
  }

  for (const f of features) {
    if (f.kind === 'kicker') {
      const top = t.wrap(sAt(f.at) + f.length);
      const slope = (2 * f.height) / f.length;
      const parts: string[] = [];
      let far = 0;
      for (const v of [STARTER_SPEED, TOP_SPEED]) {
        const fl = fly(t, top, v, v * slope);
        far = Math.max(far, fl.distance);
        parts.push(`@${v}: ${fmt(fl.distance)}m apex ${fl.apex.toFixed(0)}m`);
        if (fl.hit) w(`kicker @${f.at} at ${v} m/s: ${fl.hit}`);
        if (!fl.landed && !fl.hit) w(`kicker @${f.at} at ${v} m/s lands in a chasm`);
      }
      console.log(`    kicker @${f.at} ${f.height}/${f.length} slope ${slope.toFixed(2)}  ${parts.join('  ')}`);
      clearZones.push([sAt(f.at), f.length + far + LANDING_CLEAR, `kicker @${f.at}`]);
    }
    if (f.kind === 'tunnel') {
      for (const g of features) {
        if ((g.kind === 'jump' || g.kind === 'kicker') && inRange(sAt(g.at), f.from, f.to)) w(`${g.kind} @${g.at} inside tunnel ${f.from}..${f.to}`);
        if (g.kind === 'arch' && inRange(sAt(g.at), f.from, f.to)) w(`arch @${g.at} inside tunnel`);
        if (g.kind === 'dunes' && g.amplitude * 2 > f.ceiling / 3 && (inRange(sAt(g.from), f.from, f.to) || inRange(sAt(f.from), g.from, g.to))) {
          w(`dunes ${g.from}..${g.to} under tunnel ceiling ${f.ceiling}`);
        }
      }
    }
    if (f.kind === 'arch') {
      const s = sAt(f.at);
      if (f.offset - f.opening / 2 < t.minXAt(s) || f.offset + f.opening / 2 > t.maxXAt(s)) w(`arch @${f.at} opening leaves the course`);
      if (t.isGap(s)) w(`arch @${f.at} over a chasm`);
    }
    if (f.kind === 'pillar' || f.kind === 'boostPad') {
      const s = sAt(f.at);
      if (t.isGap(s)) w(`${f.kind} @${f.at} in a chasm`);
      if (f.lateral < t.minXAt(s) || f.lateral > t.maxXAt(s)) w(`${f.kind} @${f.at} outside the course`);
    }
  }
  for (const [s0, len, what] of clearZones) {
    for (const o of t.obstacles) {
      const d = t.delta(s0, o.s);
      if (d > 0 && d < len) w(`${o.kind} at s=${fmt(o.s)} in the ramp/flight/landing zone of ${what}`);
    }
  }
  for (const o of t.obstacles) if (t.isGap(o.s)) w(`${o.kind} at s=${fmt(o.s)} in a chasm`);

  // Every obstacle leaves a free lane somewhere between the hard boundaries.
  for (const o of t.obstacles) {
    if (o.kind === 'archLeg') continue;
    const near = t.obstaclesNear(o.s, 6, 6).filter((p) => p.kind !== 'archLeg');
    const blocks = near.map((p) => [p.x - p.radius, p.x + p.radius]).sort((a, b) => a[0] - b[0]);
    let cursor = t.minXAt(o.s);
    let widest = 0;
    for (const [a, b] of blocks) {
      widest = Math.max(widest, a - cursor);
      cursor = Math.max(cursor, b);
    }
    widest = Math.max(widest, t.maxXAt(o.s) - cursor);
    const lane = isMain ? OPEN_LANE : BRANCH_LANE;
    if (widest < lane) w(`${o.kind} at s=${fmt(o.s)} leaves no ${lane}m lane (widest ${widest.toFixed(1)}m)`);
  }
  for (const a of t.arches) {
    const lane = isMain ? OPEN_LANE : BRANCH_LANE;
    if (a.openMax - a.openMin < lane) w(`arch at s=${fmt(a.s)} opening ${(a.openMax - a.openMin).toFixed(0)}m < ${lane}m`);
  }
}

/** Pickups: a boost cell's catch radius, and clearance kept from rock around pickups. */
const CELL_RADIUS = 3;
const PICKUP_CLEAR = 3;

/** Boost cells and pads: on the drivable area, clear of chasms, rock and junction lanes. */
function checkPickups(t: Ribbon, label: string, warn: string[], junctions: [number, number][]) {
  const w = (m: string) => warn.push(`${label}: ${m}`);
  const inJunction = (s: number) => junctions.some(([a, b]) => t.delta(a, s) >= 0 && t.delta(s, b) >= 0);
  const bad = (s: number, x: number, r: number): string | null => {
    if (t.isGap(s)) return 'over a chasm';
    if (inJunction(s)) return 'inside a junction';
    if (x - r < t.minXAt(s) || x + r > t.maxXAt(s)) return 'outside the drivable area';
    for (const o of t.obstaclesNear(s, 30, 30)) {
      if (Math.hypot(t.delta(s, o.s), x - o.x) < o.radius + r + PICKUP_CLEAR) return `on a ${o.kind} at s=${fmt(o.s)}`;
    }
    return null;
  };
  for (const c of t.cells) {
    const why = bad(c.s, c.x, CELL_RADIUS);
    if (why) w(`boost cell ${c.index} at s=${fmt(c.s)} x=${c.x} ${why}`);
  }
  for (const c of t.repairCells) {
    const why = bad(c.s, c.x, CELL_RADIUS);
    if (why) w(`repair cell ${c.index} at s=${fmt(c.s)} x=${c.x} ${why}`);
  }
  for (const p of t.boostPads) {
    for (const ds of [-p.length / 2, 0, p.length / 2]) {
      const why = bad(p.s + ds, p.x, p.width / 2);
      if (why) {
        w(`boost pad at s=${fmt(p.s)} x=${p.x} ${why}`);
        break;
      }
    }
  }
}

interface Edged {
  pos: { x: number; z: number };
  right: { x: number; z: number };
  edgeL: number;
  edgeR: number;
}

/** Horizontal clearance between the facing hard boundaries of two samples (negative = overlap). */
function clearance(a: Edged, b: Edged): number {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const facing = (p: Edged, sx: number, sz: number) => (sx * p.right.x + sz * p.right.z >= 0 ? p.edgeR : p.edgeL);
  return d - facing(a, dx, dz) - facing(b, -dx, -dz);
}

// The renderer picks a track's biome kit from its world, and the scenery must be written for
// that kit; the sea sits at SEA_LEVEL, so a coast road below it would be drawn underwater.
function checkWorld(t: Track, def: TrackDef, warn: string[]) {
  let biome: string;
  try {
    biome = worldOfTrack(def.id).biome;
  } catch (e) {
    warn.push(`world: ${(e as Error).message}`);
    return;
  }
  const scenery = sceneryById(def.id);
  if (scenery.biome !== biome) warn.push(`world: scenery is ${scenery.biome} but the track's world is ${biome}`);
  if (scenery.biome !== 'beach') return;
  const ribbons: Ribbon[] = [t, ...t.branches.map((b) => b.ribbon)];
  for (const r of ribbons) {
    const low = r.samples.reduce((m, p) => (p.gap ? m : Math.min(m, p.pos.y)), Infinity);
    if (low < SEA_LEVEL + SEA_CLEARANCE) warn.push(`world: road dips to ${low.toFixed(1)}m, under ${SEA_CLEARANCE}m above the sea`);
  }
}

/** Around a declared crossing the two stretches may overlap within this much s of it. */
const CROSSING_ZONE = 260;
/** A declared crossing's two points must be this close horizontally to really meet. */
const CROSSING_MEET = 40;
/** A flat X keeps both roads level within this. */
const FLAT_LEVEL = 1.5;
/** A loop or corkscrew sits on a straight: no corner tighter than this around it. */
const STUNT_STRAIGHT = 600;
const STUNT_APPROACH = 150;
/** Drops keep this far from a junction (racers cross there). */
const DROP_JUNCTION_CLEAR = 120;
/** Rookie hazards (difficulty ≤ ROOKIE): long warnings, wide openings, gentle gusts. */
const ROOKIE = 2;
const ROOKIE_WARN = 2.5;
const ROOKIE_OPENING = 24;
const ROOKIE_GUST = 5;
const ROOKIE_CROSS = 3;
/** Any hazard: at least this much warning and a lane this wide. */
const HAZARD_WARN = 1.2;

function checkCrossings(t: Track, warn: string[]) {
  for (const c of t.crossings) {
    const a = t.sampleAt(c.s);
    const b = t.sampleAt(c.other);
    const label = `crossing @s=${fmt(c.s)}/${fmt(c.other)}`;
    const meet = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    if (meet > CROSSING_MEET) warn.push(`${label}: the two stretches are ${fmt(meet)}m apart, they do not meet there`);
    const dy = Math.abs(a.pos.y - b.pos.y);
    if (c.style === 'bridge' && dy < CROSSING_BRIDGE_CLEARANCE) warn.push(`${label}: bridge clearance ${dy.toFixed(1)}m < ${CROSSING_BRIDGE_CLEARANCE}m`);
    if (c.style === 'flat' && dy > FLAT_LEVEL) warn.push(`${label}: flat X roads differ by ${dy.toFixed(1)}m`);
    for (const s of [c.s, c.other]) {
      for (let d = -CROSSING_ZONE / 2; d <= CROSSING_ZONE / 2; d += t.step) {
        const p = t.sampleAt(s + d);
        if (p.gap || Number.isFinite(p.ceiling) || p.magnet) {
          warn.push(`${label}: chasm, tunnel or stunt in the crossing`);
          break;
        }
      }
    }
    console.log(`  ${label} ${c.style}: meet ${fmt(meet)}m, height difference ${dy.toFixed(1)}m`);
  }
}

/** Loops, corkscrews, drops, slick and hazards. */
function checkShapes(t: Ribbon, features: TrackFeature[], label: string, warn: string[], difficulty: number, junctions: [number, number, number][]) {
  const w = (m: string) => warn.push(`${label}: ${m}`);
  const sAt = (u: number) => t.paramToS(u);
  const straightAround = (s0: number, s1: number, what: string) => {
    const r = minRadiusBetween(t, t.wrap(s0 - STUNT_APPROACH), s1 - s0 + 2 * STUNT_APPROACH);
    if (r < STUNT_STRAIGHT) w(`${what} not on a straight (radius ${fmt(r)}m)`);
    for (const o of t.obstacles) if (t.delta(s0 - STUNT_APPROACH, o.s) >= 0 && t.delta(o.s, s1) >= 0) w(`${o.kind} at s=${fmt(o.s)} in ${what}`);
    for (const j of t.jumps) if (t.delta(s0 - STUNT_APPROACH, j.gapEnd) >= 0 && t.delta(j.rampStart, s1 + STUNT_APPROACH) >= 0) w(`jump in or next to ${what}`);
    for (const p of t.boostPads) if (t.delta(s0, p.s) >= 0 && t.delta(p.s, s1) >= 0) w(`boost pad in ${what}`);
  };
  for (const f of features) {
    if (f.kind === 'loop') {
      const s0 = sAt(f.at);
      const top = Math.max(...t.samples.filter((p) => t.delta(s0, p.s) >= 0 && t.delta(p.s, s0 + f.span) >= 0).map((p) => p.pos.y)) - t.sampleAt(s0).pos.y;
      console.log(`    loop @${f.at} radius ${f.radius} span ${f.span} shift ${f.shift}: top ${top.toFixed(0)}m up`);
      if (Math.abs(f.shift) < t.sampleAt(s0).width + 4) w(`loop @${f.at} shift ${f.shift} lets the exit lane run into the entry`);
      straightAround(s0, s0 + f.span + f.settle, `loop @${f.at}`);
    }
    if (f.kind === 'corkscrew') {
      straightAround(sAt(f.from), sAt(f.to), `corkscrew @${f.from}`);
      console.log(`    corkscrew @${f.from}..${f.to} ${f.turns} turn(s), ${fmt(sAt(f.to) - sAt(f.from))}m`);
    }
    if (f.kind === 'drop') {
      for (const [a, b, side] of junctions) {
        if (f.side !== undefined && f.side !== side) continue;
        if (t.delta(sAt(f.from) - DROP_JUNCTION_CLEAR, b) >= 0 && t.delta(a, sAt(f.to) + DROP_JUNCTION_CLEAR) >= 0) w(`drop ${f.from}..${f.to} next to a junction`);
      }
    }
    if (f.kind === 'hazard') {
      const d = f.hazard;
      const h = t.hazards.find((x) => x.def.id === d.id);
      if (!h) continue;
      const lane = t.maxXAt(h.s0) - t.minXAt(h.s0);
      const rookie = difficulty <= ROOKIE;
      console.log(`    hazard ${d.type} ${d.id} @s=${fmt(h.s0)}${h.s1 !== h.s0 ? `..${fmt(h.s1)}` : ''}`);
      if (t.isGap(h.s0)) w(`hazard ${d.id} over a chasm`);
      for (const [a, b] of junctions) if (t.delta(a - 60, h.s0) >= 0 && t.delta(h.s0, b + 60) >= 0) w(`hazard ${d.id} in a junction`);
      switch (d.type) {
        case 'sweeper': {
          const lo = Math.min(d.xFrom, d.xTo);
          const hi = Math.max(d.xFrom, d.xTo);
          if (lo > t.minXAt(h.s0) + d.radius && hi < t.maxXAt(h.s0) - d.radius) w(`sweeper ${d.id} never parks off the course`);
          if (hi < t.minXAt(h.s0) || lo > t.maxXAt(h.s0)) w(`sweeper ${d.id} never reaches the course`);
          if (Math.abs(d.xFrom) < lane / 2 + d.radius && Math.abs(d.xTo) < lane / 2 + d.radius) w(`sweeper ${d.id}: neither end is off the course`);
          if (rookie && d.cross < ROOKIE_CROSS) w(`sweeper ${d.id} crosses in ${d.cross}s, rookie tracks need ≥ ${ROOKIE_CROSS}s`);
          break;
        }
        case 'blocker': {
          if (d.offset - d.opening / 2 < t.minXAt(h.s0) || d.offset + d.opening / 2 > t.maxXAt(h.s0)) w(`blocker ${d.id} opening leaves the course`);
          if (d.opening < OPEN_LANE) w(`blocker ${d.id} opening ${d.opening}m < ${OPEN_LANE}m`);
          {
            // The way through must be on the paved road: an opening out on the run-off reads as
            // a wall across the course, and the whole field dies on it.
            const half = t.widthAt(h.s0) / 2;
            const paved = Math.min(half, d.offset + d.opening / 2) - Math.max(-half, d.offset - d.opening / 2);
            if (paved < OPEN_LANE) w(`blocker ${d.id} opening has only ${paved.toFixed(0)}m on the road (< ${OPEN_LANE}m)`);
          }
          if (d.warn < HAZARD_WARN) w(`blocker ${d.id} warns only ${d.warn}s`);
          if (rookie && (d.opening < ROOKIE_OPENING || d.warn < ROOKIE_WARN)) w(`blocker ${d.id} too harsh for a rookie track (opening ${d.opening}, warn ${d.warn})`);
          break;
        }
        case 'dropper': {
          if (d.warn < HAZARD_WARN) w(`dropper ${d.id} warns only ${d.warn}s`);
          if (rookie && d.warn < ROOKIE_WARN) w(`dropper ${d.id} warns ${d.warn}s, rookie tracks need ≥ ${ROOKIE_WARN}s`);
          if (d.count * d.radius * 2 > lane * 0.5) w(`dropper ${d.id} can cover more than half the course at once`);
          for (let s = h.s0; s <= h.s1; s += t.step) if (t.isGap(s)) { w(`dropper ${d.id} spans a chasm`); break; }
          break;
        }
        case 'gust':
          if (rookie && Math.abs(d.strength) > ROOKIE_GUST) w(`gust ${d.id} ${d.strength} m/s² too strong for a rookie track`);
          break;
      }
    }
  }
}

// --- Shortcut trade-off: measured by driving it, not by its length ---------------------------
// A stock glider is raced from the grid three times by the same driver: round the main road,
// through the shortcut flat out (boost held, never lifting) and through it lifting to the safe
// speed on rough ground. Every run is identical until the driver lines up for the shortcut,
// so the difference in when each one passes a mark past the rejoin is the time it saves.
// Averaged over a few runs, each with its own seed and a later getaway from the grid, so one
// unlucky jolt or one hazard timing (the AI cannot dodge every scheduled hazard) doesn't decide
// the number.

/** The measuring driver: a sharp line and quick hands, like a skilled player. */
const MEASURE_EYES = 0.9;
/** Stock armour (1.0), no upgrades: the glider the hull targets are written for. */
const MEASURE_RACER = 'dustwing';
/** Seed and seconds the driver sits on the brake after GO, per run: the delays shift where the hazards' schedules catch it. */
const MEASURE_RUNS: { seed: number; hold: number }[] = [
  { seed: 4242, hold: 0 },
  { seed: 4243, hold: 6 },
  { seed: 4244, hold: 13 },
];
/** The clock stops this far past the rejoin, so a messy merge counts against the shortcut. */
const MEASURE_TAIL = 300;
/** A measuring run longer than this many seconds is stuck. */
const MEASURE_TIMEOUT = 240;
/**
 * Flat out, a shortcut saves this many seconds: enough to be worth a third of a hull, not so
 * much that one cut decides a race (telemetry: one 4 s cut took a player from P6 to P1).
 */
const FLAT_SAVING: [number, number] = [1.5, 3.5];
/** Lifted through, it still pays a little: the careful line is a choice, not a trap. */
const LIFT_SAVING: [number, number] = [0.2, 2];
/** Flat out must beat lifting by at least this, or there is nothing to choose between. */
const CHOICE_GAP = 0.8;
/** Hull a stock glider loses flat out: a real chunk, survivable from fresh, deadly when battered. */
const FLAT_HULL: [number, number] = [0.25, 0.45];
/** Hull the lifted line costs at most: the careful way is cheap. */
const LIFT_HULL = 0.1;
/** Fewest runs that must survive the main road for the average to mean anything. */
const MEASURE_MIN_FAIR = 2;
const WAIT: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: false };
const HOLD: PlayerInput = { steer: 0, nudge: 0, brake: true, boost: false };

interface Measured {
  /** Race time at the mark past the rejoin, or null when the run wrecked. */
  time: number | null;
  damage: number;
}

function measure(t: Track, b: Branch, mode: 'main' | 'flat' | 'lift', seed: number, hold: number): Measured {
  const stats = effectiveStats(racerById(MEASURE_RACER), noUpgrades());
  const race = new Race(t, {
    laps: t.def.laps,
    seed,
    entrants: [{ id: 'm', name: 'measure', racerId: MEASURE_RACER, stats, isPlayer: true, skill: MEASURE_EYES }],
  });
  const options: AiOptions = mode === 'main' ? { shortcuts: false, cellDetours: true } : { shortcuts: b.def.id, cellDetours: true, rough: mode };
  const eyes = new AiDriver(MEASURE_EYES, seed, options);
  const v = race.vehicles[0];
  const r = v.state;
  const mark = b.exitS + MEASURE_TAIL;
  for (let n = 0; n * SIM_DT < MEASURE_TIMEOUT; n++) {
    let input = WAIT;
    if (race.phase === 'racing') {
      // The driver's eyes run from GO either way, so the run only differs in when it leaves.
      input = eyes.drive(v, t, race.racers, race.time);
      if (race.time < hold) input = HOLD;
      if (mode === 'flat' && r.branch === b.index) input = { ...input, boost: true };
    }
    race.step(input);
    if (r.crashed > 0) return { time: null, damage: r.damage };
    if (r.branch < 0 && r.distance >= mark) return { time: race.time, damage: r.damage };
  }
  throw new Error(`${t.def.id}: measuring ${b.def.id} (${mode}) never reached s=${fmt(mark)}`);
}

/** Saving flat out and lifting, and the hull each costs, against the targets above. */
function checkTradeOff(t: Track, b: Branch, label: string, warn: string[]) {
  const runs = MEASURE_RUNS.map(({ seed, hold }) => ({
    main: measure(t, b, 'main', seed, hold),
    flat: measure(t, b, 'flat', seed, hold),
    lift: measure(t, b, 'lift', seed, hold),
  }));
  // A wreck on the main road (a hazard caught out the measuring driver) says nothing about the shortcut.
  const fair = runs.filter((r) => r.main.time !== null);
  if (fair.length < MEASURE_MIN_FAIR) {
    warn.push(`${label}: only ${fair.length} of ${runs.length} measuring runs survived the main road`);
    return;
  }
  const wrecks = (k: 'flat' | 'lift') => fair.filter((r) => r[k].time === null).length;
  const mean = (f: (r: (typeof fair)[number]) => number) => fair.reduce((a, r) => a + f(r), 0) / fair.length;
  const kept = (k: 'flat' | 'lift') => fair.filter((r) => r[k].time !== null);
  const saving = (k: 'flat' | 'lift') => {
    const ok = kept(k);
    return ok.length === 0 ? NaN : ok.reduce((a, r) => a + (r.main.time as number) - (r[k].time as number), 0) / ok.length;
  };
  const fs = saving('flat');
  const ls = saving('lift');
  const fh = mean((r) => r.flat.damage - r.main.damage);
  const lh = mean((r) => r.lift.damage - r.main.damage);
  const wreckNote = (k: 'flat' | 'lift') => (wrecks(k) > 0 ? ` (${wrecks(k)}/${fair.length} wrecked)` : '');
  const row = `flat out ${fs.toFixed(2).padStart(5)}s hull ${(fh * 100).toFixed(0).padStart(2)}%${wreckNote('flat')}  lifting ${ls.toFixed(2).padStart(5)}s hull ${(lh * 100).toFixed(0).padStart(2)}%${wreckNote('lift')}`;
  console.log(`    trade-off: ${row}`);
  shortcutTable.push(`${t.def.id.padEnd(13)} ${b.def.name.padEnd(16)} ${row}`);
  if (wrecks('flat') > 0 || wrecks('lift') > 0) warn.push(`${label}: a measuring run wrecked in the shortcut (${row})`);
  if (!(fs >= FLAT_SAVING[0] && fs <= FLAT_SAVING[1])) warn.push(`${label}: flat out saves ${fs.toFixed(2)}s, outside ${FLAT_SAVING.join('..')}s`);
  if (!(ls >= LIFT_SAVING[0] && ls <= LIFT_SAVING[1])) warn.push(`${label}: lifting saves ${ls.toFixed(2)}s, outside ${LIFT_SAVING.join('..')}s`);
  if (!(fs - ls >= CHOICE_GAP)) warn.push(`${label}: flat out beats lifting by only ${(fs - ls).toFixed(2)}s (< ${CHOICE_GAP}s): no real choice`);
  if (fh < FLAT_HULL[0] || fh > FLAT_HULL[1]) warn.push(`${label}: flat out costs ${(fh * 100).toFixed(0)}% hull, outside ${FLAT_HULL.map((x) => x * 100).join('..')}%`);
  if (lh > LIFT_HULL) warn.push(`${label}: lifting costs ${(lh * 100).toFixed(0)}% hull (> ${LIFT_HULL * 100}%)`);
}

const shortcutTable: string[] = [];

function check(def: TrackDef): string[] {
  const warn: string[] = [];
  const t = new Track(def);
  const startR = minRadiusBetween(t, t.length - 100, 300);
  console.log(`\n${def.id} "${def.name}" d${def.difficulty} ${def.laps} laps  lap@${STARTER_SPEED} ${(t.length / STARTER_SPEED).toFixed(0)}s`);
  checkRibbon(t, def.features, def.points.length, 'main', warn, true);
  const mainJunctions = t.branches.flatMap((b): [number, number][] => [
    [b.entryS, b.entryS + BRANCH_JUNCTION_LENGTH],
    [b.exitS - BRANCH_JUNCTION_LENGTH, b.exitS],
  ]);
  checkPickups(t, 'main', warn, mainJunctions);
  const lines = (f: TrackFeature[]) => f.filter((x) => x.kind === 'boostCells').length;
  const allCells = t.cells.length + t.branches.reduce((n, b) => n + b.ribbon.cells.length, 0);
  const allLines = lines(def.features) + t.branches.reduce((n, b) => n + lines(b.def.features), 0);
  const pads = t.boostPads.length + t.branches.reduce((n, b) => n + b.ribbon.boostPads.length, 0);
  console.log(`  pickups: ${allLines} cell lines, ${allCells} cells, ${pads} boost pads (all ribbons)`);
  if (t.length < LAP_MIN || t.length > LAP_MAX) warn.push(`lap length ${fmt(t.length)} outside ${LAP_MIN}..${LAP_MAX}`);
  if (startR < RUNOUT_MIN_RADIUS) warn.push(`start line not on a straight (radius ${fmt(startR)}m)`);
  checkWorld(t, def, warn);

  const J = BRANCH_JUNCTION_LENGTH;
  for (const b of t.branches) {
    const r = b.ribbon;
    const label = `branch ${b.def.id}`;
    const span = b.exitS - b.entryS;
    const saving = span - r.length;
    console.log(`  ${label} "${b.def.name}" side ${b.side > 0 ? 'right' : 'left'} @${b.def.from}..${b.def.to}: skips ${fmt(span)}m, runs ${fmt(r.length)}m, saves ${fmt(saving)}m = ${(saving / RACE_SPEED).toFixed(1)}s at ${RACE_SPEED} m/s`);
    checkRibbon(r, b.def.features, b.def.points.length + 4, label, warn, false);
    if (b.def.width < BRANCH_WIDTH[0] || b.def.width > BRANCH_WIDTH[1]) warn.push(`${label}: width ${b.def.width} outside ${BRANCH_WIDTH.join('..')}`);
    checkTradeOff(t, b, label, warn);
    const jEnd = r.paramToS(1);
    const xStart = r.paramToS(b.def.points.length + 2);
    if (jEnd > J * 1.5 || r.length - xStart > J * 1.5) warn.push(`${label}: junctions stretched (${fmt(jEnd)}m, ${fmt(r.length - xStart)}m): first/last points too far off`);
    const inJunction = (s: number) => s < jEnd || s > xStart;
    checkPickups(r, label, warn, [[0, jEnd], [xStart, r.length]]);
    for (const o of r.obstacles) if (inJunction(o.s)) warn.push(`${label}: ${o.kind} inside a junction at s=${fmt(o.s)}`);
    for (const p of r.boostPads) if (inJunction(p.s)) warn.push(`${label}: boost pad inside a junction`);
    for (const j of r.jumps) if (inJunction(j.rampStart) || inJunction(j.gapEnd)) warn.push(`${label}: jump inside a junction`);
    for (const smp of r.samples) {
      if (inJunction(smp.s) && (smp.gap || Number.isFinite(smp.ceiling) || smp.wallHeight > 0)) {
        warn.push(`${label}: chasm, tunnel or canyon inside a junction at s=${fmt(smp.s)}`);
        break;
      }
    }
    // Main road features in the junction spans would sit in the crossing lane.
    for (const s0 of [b.entryS, b.exitS - J]) {
      for (const o of t.obstacles) if (t.delta(s0, o.s) >= 0 && t.delta(s0, o.s) <= J) warn.push(`${label}: main ${o.kind} inside a junction`);
      for (let s = s0; s <= s0 + J; s += t.step) {
        const smp = t.sampleAt(s);
        if (smp.gap || Number.isFinite(smp.ceiling) || smp.wallHeight > 0) {
          warn.push(`${label}: main chasm, tunnel or canyon at a junction`);
          break;
        }
      }
    }
    // Between the junctions the branch must stay clear of every part of the main loop.
    let worst = Infinity;
    let worstAt = 0;
    for (let k = 0; k < r.samples.length; k += 5) {
      const bs = r.samples[k];
      if (bs.s < jEnd + DIVERGE || bs.s > xStart - DIVERGE) continue;
      for (let q = 0; q < t.samples.length; q += 5) {
        const c = clearance(bs, t.samples[q]);
        if (c < worst) {
          worst = c;
          worstAt = bs.s;
        }
      }
    }
    if (worst < MIN_CLEARANCE) warn.push(`${label}: comes within ${fmt(worst)}m of the main course's boundary at branch s=${fmt(worstAt)} of ${fmt(r.length)}`);
  }

  // Non-adjacent parts of the main loop, except where they cross on purpose.
  const crossed = (a: number, b: number) =>
    t.crossings.some((c) => {
      const near = (x: number, y: number) => Math.abs(t.delta(x, y)) < CROSSING_ZONE;
      return (near(a, c.s) && near(b, c.other)) || (near(a, c.other) && near(b, c.s));
    });
  checkCrossings(t, warn);
  const sided = t.branches.flatMap((b): [number, number, number][] => [
    [b.entryS, b.entryS + BRANCH_JUNCTION_LENGTH, b.side],
    [b.exitS - BRANCH_JUNCTION_LENGTH, b.exitS, b.side],
  ]);
  checkShapes(t, def.features, 'main', warn, def.difficulty, sided);
  for (const b of t.branches) checkShapes(b.ribbon, b.def.features, `branch ${b.def.id}`, warn, def.difficulty, []);
  const st = 5;
  for (let a = 0; a < t.samples.length; a += st) {
    for (let b = a + st; b < t.samples.length; b += st) {
      const sa = t.samples[a];
      const sb = t.samples[b];
      if (Math.abs(t.delta(sa.s, sb.s)) < ADJACENT_S) continue;
      if (sa.magnet || sb.magnet || crossed(sa.s, sb.s)) continue;
      const c = clearance(sa, sb);
      if (c < MIN_CLEARANCE) {
        warn.push(`main: s=${fmt(sa.s)} and s=${fmt(sb.s)} boundaries only ${fmt(c)}m apart`);
        b = t.samples.length;
        a += 50;
      }
    }
  }
  for (const m of warn) console.log(`  WARN ${m}`);
  return warn;
}

// Node global; the tools share the browser tsconfig, which has no Node typings.
declare const process: { exitCode: number; argv: string[] };

let warnings = 0;
// Track ids on the command line check only those (the shortcut runs make a full check slow).
const only = process.argv.slice(2);
const chosen = only.length === 0 ? TRACKS : TRACKS.filter((d) => only.includes(d.id));
if (only.length > 0 && chosen.length !== only.length) {
  throw new Error(`track-check: unknown track id in ${only.join(', ')}`);
}
for (const def of chosen) warnings += check(def).length;
console.log(`\nShortcuts (stock ${MEASURE_RACER}, saving vs the main road to ${MEASURE_TAIL} m past the rejoin):`);
for (const line of shortcutTable) console.log(`  ${line}`);
console.log(`\n${chosen.length} tracks, ${warnings} warnings`);
process.exitCode = warnings > 0 ? 1 : 0;
