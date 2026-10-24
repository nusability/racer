import type { AoLook } from '../look/lookTuning.ts';
import { ARCH_DEPTH } from './features.ts';
import type { RibbonView } from './shape.ts';

// Baked ambient occlusion for the course, worked out once at build time (free per frame):
// how much of each road sample lies under another road (a flyover, a deck, a knot crossing
// itself) or under a rock arch. The corridor darkens those samples' vertex colours, plus the
// road edges at the foot of walls; see Corridor.buildRoad.

/** Ground grid for finding road samples near one another, metres. */
const CELL = 16;
/**
 * A sample only covers another of its own ribbon this far apart along it, so a road climbing
 * steeply (into a loop) never shades the stretch just before it.
 */
const SELF_GAP_PER_CLEAR = 3;

/** Per view (main loop first), per sample: 0 open sky … 1 fully under another road. */
export function roadCover(views: RibbonView[], ao: AoLook): Float32Array[] {
  const [minClear, maxClear] = ao.coverClear;
  const grid = new Map<string, { v: number; k: number }[]>();
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  views.forEach((view, v) => {
    view.ribbon.samples.forEach((smp, k) => {
      if (smp.gap) return;
      const id = key(smp.pos.x, smp.pos.z);
      let list = grid.get(id);
      if (!list) grid.set(id, (list = []));
      list.push({ v, k });
    });
  });
  return views.map((view, v) => {
    const r = view.ribbon;
    const n = r.samples.length;
    const selfGap = Math.round((maxClear * SELF_GAP_PER_CLEAR) / r.step);
    const hit = new Float32Array(n);
    r.samples.forEach((smp, k) => {
      if (smp.gap) return;
      const cx = Math.floor(smp.pos.x / CELL);
      const cz = Math.floor(smp.pos.z / CELL);
      for (let dx = -1; dx <= 1 && hit[k] === 0; dx++) {
        for (let dz = -1; dz <= 1 && hit[k] === 0; dz++) {
          for (const o of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
            if (o.v === v) {
              const d = Math.abs(o.k - k);
              if ((r.closed ? Math.min(d, n - d) : d) < selfGap) continue;
            }
            const above = views[o.v].ribbon.samples[o.k];
            const rise = above.pos.y - smp.pos.y;
            if (rise < minClear || rise > maxClear) continue;
            if (Math.hypot(above.pos.x - smp.pos.x, above.pos.z - smp.pos.z) > above.width / 2) continue;
            hit[k] = 1;
            break;
          }
        }
      }
    });
    // Rock arches span the whole road over their depth.
    const span = Math.ceil(ARCH_DEPTH / 2 / r.step);
    for (const a of r.arches) {
      const at = Math.round(a.s / r.step);
      for (let d = -span; d <= span; d++) {
        const j = r.closed ? (((at + d) % n) + n) % n : Math.max(0, Math.min(n - 1, at + d));
        hit[j] = 1;
      }
    }
    // Soft ends: a box blur over the neighbouring samples.
    const soft = new Float32Array(n);
    const m = ao.coverSoften;
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let d = -m; d <= m; d++) {
        const j = r.closed ? (((k + d) % n) + n) % n : Math.max(0, Math.min(n - 1, k + d));
        sum += hit[j];
      }
      soft[k] = sum / (2 * m + 1);
    }
    return soft;
  });
}
