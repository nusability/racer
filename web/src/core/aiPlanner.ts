// Lateral path planner for the AI: a dynamic program over a grid of (steps along s) x
// (lateral cells) ahead of the racer. Obstacles block the cells their capsule covers, hard
// boundaries bound each row, sand costs extra, and a cell may only reach cells within the
// racer's swerve rate in the next row. The cheapest path stays near the racing line and
// threads boulder fields, which greedy "dodge the next rock" rules can't do.

import type { Ribbon } from './track.ts';
import {
  AI_PLAN_BLOCK_COST,
  AI_PLAN_HALF_SPAN,
  AI_PLAN_LATERAL,
  AI_PLAN_LINE_COST,
  AI_PLAN_MAX_SLOPE,
  AI_PLAN_SAND_COST,
  AI_PLAN_STEP,
  AI_PLAN_SWERVE_COST,
  RACER_HALF_WIDTH,
  RACER_RADIUS,
} from '../data/tuning.ts';

/** Anything the planner steers around: a cylinder in track space. */
export interface Blocker {
  s: number;
  x: number;
  radius: number;
}

export interface PlanRequest {
  ribbon: Ribbon;
  s: number;
  x: number;
  /** Current sideways motion as metres of x per metre of s. */
  slope0: number;
  /** For this many metres the racer is committed to slope0 (its response lag). */
  lagDist: number;
  /** Lateral offset the racer would like to hold (racing line). */
  line: number;
  /** How far ahead to plan, metres. */
  look: number;
  /** Extra space kept around blockers, metres. */
  clearance: number;
  blockers: readonly Blocker[];
  /**
   * Blockers also block this many metres in front of and behind them: the path is clear
   * before arriving and stays clear until the racer, which lags it, is past.
   */
  stretch: number;
  /** Return the path's x this many metres after the lag. */
  lead: number;
  /** Distance kept from an open (drop) edge, metres: falling off is a wreck. */
  dropMargin: number;
  /** Steepest swerve the racer can follow, metres of x per metre of s. */
  maxSlope: number;
}

export class PathPlanner {
  private cost = new Float64Array(0);
  private node = new Float64Array(0);

  /** Lateral position of the cheapest path `lead` metres past the racer's committed lag. */
  plan(q: PlanRequest): number {
    const { ribbon, s, clearance, stretch } = q;
    // Nothing past the farthest blocker changes the answer, so plan only that far.
    let far = q.lagDist + q.lead;
    for (const o of q.blockers) far = Math.max(far, ribbon.delta(s, o.s) + o.radius + RACER_RADIUS + clearance + stretch);
    const rows = Math.max(2, Math.ceil(Math.min(q.look, far) / AI_PLAN_STEP) + 1);
    // Plan within a window around the racer: run-off can make the ribbon very wide.
    let lo = q.x - AI_PLAN_HALF_SPAN;
    let hi = q.x + AI_PLAN_HALF_SPAN;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let k = 0; k < rows; k++) {
      const sk = s + k * AI_PLAN_STEP;
      minX = Math.min(minX, ribbon.minXAt(sk) + RACER_HALF_WIDTH);
      maxX = Math.max(maxX, ribbon.maxXAt(sk) - RACER_HALF_WIDTH);
    }
    lo = Math.max(lo, minX);
    hi = Math.min(hi, maxX);
    if (hi < lo) hi = lo;
    const cols = Math.floor((hi - lo) / AI_PLAN_LATERAL) + 1;
    const xAt = (j: number) => lo + j * AI_PLAN_LATERAL;
    const n = rows * cols;
    if (this.cost.length < n) {
      this.cost = new Float64Array(n);
      this.node = new Float64Array(n);
    }
    const node = this.node;
    const cost = this.cost;

    // Cell costs: blocked past the boundaries or by blockers, dearer on sand, else off-line.
    for (let k = 0; k < rows; k++) {
      const sk = s + k * AI_PLAN_STEP;
      const rowLo = ribbon.minXAt(sk) + RACER_HALF_WIDTH + (ribbon.dropAt(sk, -1) ? q.dropMargin : 0);
      const rowHi = ribbon.maxXAt(sk) - RACER_HALF_WIDTH - (ribbon.dropAt(sk, 1) ? q.dropMargin : 0);
      const road = ribbon.widthAt(sk) / 2;
      for (let j = 0; j < cols; j++) {
        const xj = xAt(j);
        let c = Math.abs(xj - q.line) * AI_PLAN_LINE_COST * AI_PLAN_STEP;
        if (xj < rowLo || xj > rowHi) c += AI_PLAN_BLOCK_COST;
        else if (Math.abs(xj) > road) c += AI_PLAN_SAND_COST;
        node[k * cols + j] = c;
      }
      for (const o of q.blockers) {
        const reach = o.radius + RACER_RADIUS + clearance;
        // A capsule: the blocker's circle stretched both ways along s.
        const along = Math.max(0, Math.abs(ribbon.delta(o.s, sk)) - stretch);
        if (along >= reach) continue;
        const hw = Math.sqrt(reach * reach - along * along);
        const j0 = Math.max(0, Math.ceil((o.x - hw - lo) / AI_PLAN_LATERAL));
        const j1 = Math.min(cols - 1, Math.floor((o.x + hw - lo) / AI_PLAN_LATERAL));
        // Dearer toward the centre: if contact can't be avoided, a glance off the edge beats
        // a dead-centre hit (the only kind that crashes).
        for (let j = j0; j <= j1; j++) node[k * cols + j] += AI_PLAN_BLOCK_COST * (2 - Math.abs(xAt(j) - o.x) / reach);
      }
    }

    // Backward pass: cheapest cost-to-go from every cell.
    const span = Math.max(1, Math.floor((AI_PLAN_STEP * Math.min(AI_PLAN_MAX_SLOPE, q.maxSlope)) / AI_PLAN_LATERAL));
    const swerve = AI_PLAN_LATERAL * AI_PLAN_SWERVE_COST;
    const last = (rows - 1) * cols;
    for (let j = 0; j < cols; j++) cost[last + j] = node[last + j];
    for (let k = rows - 2; k >= 0; k--) {
      const row = k * cols;
      const next = row + cols;
      for (let j = 0; j < cols; j++) {
        let best = Infinity;
        const a = Math.max(0, j - span);
        const b = Math.min(cols - 1, j + span);
        for (let r = a; r <= b; r++) {
          const c = cost[next + r] + Math.abs(r - j) * swerve;
          if (c < best) best = c;
        }
        cost[row + j] = node[row + j] + best;
      }
    }

    // Forward: ride the committed motion through the lag, then follow the cheapest successors.
    const cellOf = (px: number) => Math.min(cols - 1, Math.max(0, Math.round((px - lo) / AI_PLAN_LATERAL)));
    const lagRow = Math.min(rows - 2, Math.round(q.lagDist / AI_PLAN_STEP));
    let j = cellOf(q.x + q.slope0 * lagRow * AI_PLAN_STEP);
    const endRow = Math.min(rows - 1, lagRow + Math.max(1, Math.round(q.lead / AI_PLAN_STEP)));
    for (let k = lagRow + 1; k <= endRow; k++) {
      const next = k * cols;
      let best = Infinity;
      let pick = j;
      const a = Math.max(0, j - span);
      const b = Math.min(cols - 1, j + span);
      for (let r = a; r <= b; r++) {
        const c = cost[next + r] + Math.abs(r - j) * swerve;
        if (c < best) {
          best = c;
          pick = r;
        }
      }
      j = pick;
    }
    return xAt(j);
  }
}
