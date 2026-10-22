// Lateral path planner for the AI: a dynamic program over a grid of (steps along s) x
// (lateral cells) ahead of the racer. Obstacles block the cells their circle covers, walls
// bound each row, and a cell may only reach cells within the racer's swerve rate in the next
// row. The cheapest path stays near the racing line and threads boulder fields, which greedy
// "dodge the next rock" rules can't do.

import type { Track } from './track.ts';
import {
  AI_PLAN_BLOCK_COST,
  AI_PLAN_LATERAL,
  AI_PLAN_LINE_COST,
  AI_PLAN_MAX_SLOPE,
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

export class PathPlanner {
  private cost = new Float64Array(0);
  private node = new Float64Array(0);

  /**
   * Plans ahead of the racer at (s, x). For the first `lagDist` metres the racer is committed
   * to its current lateral slope `slope0` (steering takes that long to bite); from there the
   * path is free. Returns the path's mean lateral slope (metres of x per metre of s) over the
   * `window` metres after the lag: the heading the racer should be steering toward now.
   * @param line lateral offset the racer would like to hold (racing line)
   * @param look how far ahead to plan, metres
   * @param clearance extra space kept around obstacles, metres
   * @param lead obstacles also block this many metres in front of and behind them: the path
   *   is clear before arriving and stays clear until the racer, which lags it, is past
   */
  plan(
    track: Track,
    s: number,
    x: number,
    slope0: number,
    lagDist: number,
    line: number,
    look: number,
    clearance: number,
    obstacles: readonly Blocker[],
    lead: number,
    window: number,
  ): number {
    // Nothing past the farthest blocker changes the answer, so plan only that far.
    let far = lagDist + window;
    for (const o of obstacles) far = Math.max(far, track.delta(s, o.s) + o.radius + RACER_RADIUS + clearance + lead);
    const rows = Math.max(2, Math.ceil(Math.min(look, far) / AI_PLAN_STEP) + 1);
    let half = 0;
    for (let k = 0; k < rows; k++) half = Math.max(half, track.widthAt(s + k * AI_PLAN_STEP) / 2 - RACER_HALF_WIDTH);
    const cols = Math.floor((2 * half) / AI_PLAN_LATERAL) + 1;
    const xAt = (j: number) => -half + j * AI_PLAN_LATERAL;
    const n = rows * cols;
    if (this.cost.length < n) {
      this.cost = new Float64Array(n);
      this.node = new Float64Array(n);
    }
    const node = this.node;
    const cost = this.cost;

    // Cell costs: blocked by walls or obstacles, otherwise distance from the line.
    for (let k = 0; k < rows; k++) {
      const sk = s + k * AI_PLAN_STEP;
      const room = track.widthAt(sk) / 2 - RACER_HALF_WIDTH;
      for (let j = 0; j < cols; j++) {
        const xj = xAt(j);
        node[k * cols + j] =
          Math.abs(xj) > room ? AI_PLAN_BLOCK_COST : Math.abs(xj - line) * AI_PLAN_LINE_COST * AI_PLAN_STEP;
      }
      for (const o of obstacles) {
        const reach = o.radius + RACER_RADIUS + clearance;
        const ds = track.delta(o.s, sk);
        // A capsule: the obstacle's circle stretched by `lead` both ways along s.
        const along = Math.max(0, Math.abs(ds) - lead);
        if (along >= reach) continue;
        const hw = Math.sqrt(reach * reach - along * along);
        const j0 = Math.max(0, Math.ceil((o.x - hw + half) / AI_PLAN_LATERAL));
        const j1 = Math.min(cols - 1, Math.floor((o.x + hw + half) / AI_PLAN_LATERAL));
        for (let j = j0; j <= j1; j++) node[k * cols + j] += AI_PLAN_BLOCK_COST;
      }
    }

    // Backward pass: cheapest cost-to-go from every cell.
    const span = Math.max(1, Math.floor((AI_PLAN_STEP * AI_PLAN_MAX_SLOPE) / AI_PLAN_LATERAL));
    const swerve = AI_PLAN_LATERAL * AI_PLAN_SWERVE_COST;
    const last = (rows - 1) * cols;
    for (let j = 0; j < cols; j++) cost[last + j] = node[last + j];
    for (let k = rows - 2; k >= 0; k--) {
      const row = k * cols;
      const next = row + cols;
      for (let j = 0; j < cols; j++) {
        let best = Infinity;
        const lo = Math.max(0, j - span);
        const hi = Math.min(cols - 1, j + span);
        for (let q = lo; q <= hi; q++) {
          const c = cost[next + q] + Math.abs(q - j) * swerve;
          if (c < best) best = c;
        }
        cost[row + j] = node[row + j] + best;
      }
    }

    // Forward: ride the committed motion through the lag, then follow the cheapest successors.
    const cellOf = (px: number) => Math.min(cols - 1, Math.max(0, Math.round((px + half) / AI_PLAN_LATERAL)));
    const lagRow = Math.min(rows - 2, Math.round(lagDist / AI_PLAN_STEP));
    let j = cellOf(x + slope0 * lagRow * AI_PLAN_STEP);
    const j0 = j;
    const endRow = Math.min(rows - 1, lagRow + Math.max(1, Math.round(window / AI_PLAN_STEP)));
    for (let k = lagRow + 1; k <= endRow; k++) {
      const next = k * cols;
      let best = Infinity;
      let pick = j;
      const lo = Math.max(0, j - span);
      const hi = Math.min(cols - 1, j + span);
      for (let q = lo; q <= hi; q++) {
        const c = cost[next + q] + Math.abs(q - j) * swerve;
        if (c < best) {
          best = c;
          pick = q;
        }
      }
      j = pick;
    }
    return ((j - j0) * AI_PLAN_LATERAL) / ((endRow - lagRow) * AI_PLAN_STEP);
  }
}
