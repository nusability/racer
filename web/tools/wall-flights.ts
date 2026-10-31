// Flights over the course's walls (track-check): a wall stops a craft only as high as it stands
// (core/walls.ts), so a launch (a jump, a kicker, a crest the road falls away from) whose flight
// rises over a side's top where the craft can drift to it sends a racer over the wall, to fall
// beyond it. Found with the real Vehicle: a stock starter pinned at the fastest planned speed,
// hugging one side of the road on the ground, holding full steer toward that side in the air.

import { PHYSICS_AS_TUNED, resolvePhysics } from '../src/core/handling.ts';
import type { Ribbon } from '../src/core/track.ts';
import type { BoundKind, PlayerInput } from '../src/core/types.ts';
import { Vehicle, type CrashReason } from '../src/core/vehicle.ts';
import { racerById } from '../src/data/racers.ts';
import { RACER_HALF_WIDTH } from '../src/data/tuning.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';

const AS_TUNED = resolvePhysics(PHYSICS_AS_TUNED);
/** The glider whose air steering sets the drift: the stock starter, as tuned. */
const PILOT = 'dustwing';
/** Seconds pinned to the side before the run starts measuring, so a start mid-flight is no finding. */
const SETTLE = 1;
/** After a craft goes over (or hits a rock), the run picks up again this far on, on the road, metres. */
const RESPAWN = 60;
/** A launch this close to a jump's lip or a kicker's top is that feature's, metres (a step or two at speed). */
const LAUNCH_REACH = 8;
/** Wrecks that are a fall off the course, not a hit. */
const FALLS: readonly CrashReason[] = ['offEdge', 'fell', 'lost', 'splash'];

export interface WallFlight {
  /** What threw it: a jump's lip, a kicker, or a crest (or ledge) the road falls away from. */
  launch: 'jump' | 'kicker' | 'crest';
  /** s where the craft left the road, and where it passed over the boundary. */
  launchS: number;
  s: number;
  side: -1 | 1;
  kind: BoundKind;
  /** The boundary's top and the craft's height over the road as it went over, metres. */
  top: number;
  height: number;
}

/**
 * Every launch on `r` at `speed` m/s whose flight carries a craft over the boundary on either
 * side: one finding per launch and side, where it first went over.
 */
export function wallFlights(r: Ribbon, speed: number, input = 1): WallFlight[] {
  return [...sideFlights(r, speed, -1, input), ...sideFlights(r, speed, 1, input)];
}

function sideFlights(r: Ribbon, speed: number, side: -1 | 1, input: number): WallFlight[] {
  const stats = { ...effectiveStats(racerById(PILOT), noUpgrades()), topSpeed: speed };
  const hug = (s: number) => side * (r.widthAt(s) / 2 - RACER_HALF_WIDTH);
  const spawn = (s: number) => new Vehicle('wallflight', stats, r, s, hug(s), 0, 0, AS_TUNED);
  let v = spawn(0);
  const out: WallFlight[] = [];
  const steer: PlayerInput = { steer: side * input, nudge: 0, brake: false, boost: false };
  // Once round (an open ribbon end to end): the distance flown is the clock.
  const end = r.closed ? r.length + SETTLE * speed : r.length - RESPAWN;
  let flown = 0;
  let launchS = -1;
  while (flown < end) {
    const st = v.state;
    st.speed = speed;
    // Hull is no part of this: a scrape or a rock must not end the run.
    st.damage = 0;
    if (v.grounded) {
      // On the road it hugs this side's edge: anywhere across the road is a lip a racer may take.
      st.x = hug(st.s);
      v.targetX = st.x;
      st.vx = 0;
      launchS = -1;
    } else if (launchS < 0) launchS = st.s;
    const s0 = st.s;
    v.step(steer, r, [], 0, []);
    flown += r.closed ? r.wrap(st.s - s0) : st.s - s0;
    // Out past an open edge is the course's own drop, and over a chasm the flight goes on to
    // the far side (where a wall's end may meet it): neither is a wall flown over.
    const kind = r.boundAt(st.s, side);
    const beyond = side * st.x > (side > 0 ? r.maxXAt(st.s) : -r.minXAt(st.s)) && kind !== 'chasm';
    const fell = st.crashed > 0 && FALLS.includes(Object.keys(v.drive.crashes).find((k) => v.drive.crashes[k as CrashReason] > 0) as CrashReason);
    if ((beyond || fell) && kind !== 'drop' && flown > SETTLE * speed) out.push(passed(r, launchS < 0 ? st.s : launchS, st.s, side, v.alt));
    // Over the wall (or wrecked on a rock), the next launch is another racer's: back on the road further on.
    if (beyond || fell || st.crashed > 0 || st.fall !== null) {
      const next = st.s + RESPAWN;
      if (!r.closed && next >= r.length) break;
      flown += RESPAWN;
      v = spawn(r.wrap(next));
      launchS = -1;
    }
  }
  return out;
}

function passed(r: Ribbon, launchS: number, s: number, side: -1 | 1, alt: number): WallFlight {
  return { launch: launchKind(r, launchS), launchS, s, side, kind: r.boundAt(s, side), top: r.wallTopAt(s, side), height: alt - r.elevationAt(s) };
}

/** A launch within LAUNCH_REACH of a jump's lip or a kicker's top is theirs; anywhere else the road's own crest threw it. */
function launchKind(r: Ribbon, s: number): WallFlight['launch'] {
  if (r.jumps.some((j) => Math.abs(r.delta(j.lip, s)) < LAUNCH_REACH)) return 'jump';
  if (r.kickers.some((k) => Math.abs(r.delta(k, s)) < LAUNCH_REACH)) return 'kicker';
  return 'crest';
}
