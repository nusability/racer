// Slipstream: a racer close behind another on the same ribbon rides its wake. The draft it
// builds up gives less drag (a higher top speed), a slow trickle into the boost tank, and,
// pulled out of after a full draft, a short slingshot that carries the pass. Every racer gets
// it, player and AI alike: it is the visible, fair way a chasing racer closes a gap.

import type { RaceEvent, RacerState } from './types.ts';
import type { Ribbon, Track } from './track.ts';
import type { Vehicle } from './vehicle.ts';
import {
  DRAFT_BOOST_REFILL,
  DRAFT_BUILD_TIME,
  DRAFT_CHARGE_KEEP,
  DRAFT_DECAY_TIME,
  DRAFT_EVENT_OFF,
  DRAFT_EVENT_ON,
  DRAFT_FULL,
  DRAFT_HALF_WIDTH_FAR,
  DRAFT_HALF_WIDTH_NEAR,
  DRAFT_MAX_GAP,
  DRAFT_MIN_GAP,
  DRAFT_SLINGSHOT_CHARGE,
  DRAFT_SLINGSHOT_TIME,
  DRAFT_TOP_SPEED,
  RACER_LENGTH,
  SIM_DT,
} from '../data/tuning.ts';

/** Bumper-to-bumper gap from `follower` forward to `leader` along their ribbon, metres. */
export function draftGap(follower: RacerState, leader: RacerState, ribbon: Ribbon): number {
  return ribbon.delta(follower.s, leader.s) - RACER_LENGTH;
}

/**
 * How much of a wake `follower` sits in behind `leader`, 0 (none) .. 1 (right on its tail):
 * same ribbon, both on the ground, the leader still racing, the gap within the draft zone
 * and the lateral offset within a wake that narrows with distance. It weakens smoothly with
 * the gap so drifting back fades the draft rather than cutting it.
 */
export function draftStrength(follower: RacerState, leader: RacerState, ribbon: Ribbon): number {
  if (follower === leader || follower.branch !== leader.branch) return 0;
  if (follower.crashed > 0 || leader.crashed > 0 || follower.airborne || leader.airborne) return 0;
  const gap = draftGap(follower, leader, ribbon);
  if (gap < DRAFT_MIN_GAP || gap > DRAFT_MAX_GAP) return 0;
  const u = (gap - DRAFT_MIN_GAP) / (DRAFT_MAX_GAP - DRAFT_MIN_GAP);
  const half = DRAFT_HALF_WIDTH_NEAR + (DRAFT_HALF_WIDTH_FAR - DRAFT_HALF_WIDTH_NEAR) * u;
  if (Math.abs(leader.x - follower.x) > half) return 0;
  return 1 - u * u;
}

interface Wake {
  /** Seconds of full draft since this wake was entered (charges the slingshot). */
  charge: number;
  /** Seconds of slingshot left. */
  sling: number;
  /** The last 'draft' event said on. */
  on: boolean;
}

export class Slipstream {
  private readonly wakes: Wake[];
  /** Per racer, this step's best wake strength (reused buffer). */
  private readonly zone: Float64Array;

  constructor(racers: number) {
    this.wakes = Array.from({ length: racers }, () => ({ charge: 0, sling: 0, on: false }));
    this.zone = new Float64Array(racers);
  }

  /**
   * One SIM_DT, before the racers move: every racer's draft from where the whole field is
   * now (read for all before any is written, so entrant order can't bias it), and the
   * top-speed bonus (Vehicle.slip) and tank trickle it gives.
   */
  step(vehicles: readonly Vehicle[], track: Track, events: RaceEvent[]): void {
    const dt = SIM_DT;
    const n = vehicles.length;
    for (let i = 0; i < n; i++) {
      const st = vehicles[i].state;
      const ribbon = track.ribbon(st.branch);
      let best = 0;
      for (let j = 0; j < n; j++) best = Math.max(best, draftStrength(st, vehicles[j].state, ribbon));
      this.zone[i] = best;
    }
    for (let i = 0; i < n; i++) {
      const v = vehicles[i];
      const st = v.state;
      const w = this.wakes[i];
      const z = this.zone[i];
      st.draft = z > st.draft ? Math.min(z, st.draft + dt / DRAFT_BUILD_TIME) : Math.max(z, st.draft - dt / DRAFT_DECAY_TIME);
      w.sling = Math.max(0, w.sling - dt);
      if (z > 0) {
        // Dropping back far enough to lose most of the wake spends the charge; holding it builds.
        if (st.draft >= DRAFT_FULL) w.charge += dt;
        else if (st.draft < DRAFT_CHARGE_KEEP) w.charge = 0;
      } else {
        // Out of the wake (pulled out, or alongside to pass) after a full draft: slingshot.
        if (w.charge >= DRAFT_SLINGSHOT_CHARGE && st.crashed <= 0) {
          w.sling = DRAFT_SLINGSHOT_TIME;
          events.push({ type: 'slingshot', id: st.id });
        }
        w.charge = 0;
      }
      v.slip = DRAFT_TOP_SPEED * (w.sling > 0 ? 1 : st.draft);
      // Boosting spends the tank; the wake only tops up a tank at rest.
      if (!st.boosting && st.crashed <= 0) st.boost = Math.min(1, st.boost + DRAFT_BOOST_REFILL * st.draft * dt);
      const on = w.on ? st.draft > DRAFT_EVENT_OFF : st.draft >= DRAFT_EVENT_ON;
      if (on !== w.on) {
        w.on = on;
        events.push({ type: 'draft', id: st.id, on });
      }
    }
  }
}
