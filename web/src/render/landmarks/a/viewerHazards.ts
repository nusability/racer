// Dev-viewer support for bound landmarks: a fake straight road along world X (s = X, lateral
// x = world Z, height = Y), one course hazard of each type on it, and wireframes of exactly
// what the simulation collides with, so a landmark's sync can be checked by eye.

import * as THREE from 'three';
import { gustAt, hazardObstacles, type CourseHazard } from '../../../core/hazards.ts';
import type { HazardDef, Obstacle } from '../../../core/types.ts';
import type { HazardBinding } from '../types.ts';

export type ViewerHazardType = HazardDef['type'];

/** Half the fake road's drivable width, metres. */
export const ROAD_HALF = 18;
const OBSTACLE_POOL = 48;

const DEFS: Record<ViewerHazardType, HazardDef> = {
  sweeper: { type: 'sweeper', id: 'viewer-sweeper', at: 0, radius: 7, height: 30, xFrom: 34, xTo: -30, cross: 3.5, hold: 2, period: 16, phase: 0 },
  blocker: { type: 'blocker', id: 'viewer-blocker', at: 0, opening: 10, offset: -5, height: 12, warn: 3, up: 4, period: 15, phase: 0 },
  dropper: { type: 'dropper', id: 'viewer-dropper', from: -40, to: 40, count: 5, radius: 2.6, period: 11, warn: 2.4, stay: 4, phase: 0 },
  gust: { type: 'gust', id: 'viewer-gust', from: -70, to: 70, strength: -9, on: 5, period: 18, phase: 0 },
};

/** The fake course hazard: s is world X, so a def's track params are used as s directly. */
export function viewerHazard(type: ViewerHazardType): CourseHazard {
  const def = DEFS[type];
  const s0 = def.type === 'sweeper' || def.type === 'blocker' ? def.at : def.from;
  const s1 = def.type === 'sweeper' || def.type === 'blocker' ? def.at : def.to;
  return { def, s0, s1, seed: 1234, minX: -ROAD_HALF, maxX: ROAD_HALF };
}

/** Track → local for a landmark placed at world (0, 0, z) with uniform `scale` and no turn. */
export function viewerBinding(hazard: CourseHazard, z: number, scale: number): HazardBinding {
  return {
    hazard,
    toLocal: (s, x, y, out) => out.set(s / scale, y / scale, (x - z) / scale),
  };
}

/** Wireframe cylinders for every live obstacle, and a tinted slab over an active gust. */
export class HazardOverlay {
  readonly group = new THREE.Group();
  private readonly pillars: THREE.Mesh[] = [];
  private readonly obstacles: Obstacle[] = [];
  private readonly gust: THREE.Mesh | null = null;

  constructor(private readonly hazard: CourseHazard) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2060, wireframe: true, fog: false, depthTest: false, transparent: true });
    for (let i = 0; i < OBSTACLE_POOL; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 100;
      m.visible = false;
      this.pillars.push(m);
      this.group.add(m);
    }
    if (hazard.def.type === 'gust') {
      const len = hazard.s1 - hazard.s0;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(len, 6, ROAD_HALF * 2),
        new THREE.MeshBasicMaterial({ color: 0x40c0ff, transparent: true, opacity: 0, depthWrite: false, fog: false }),
      );
      slab.position.set((hazard.s0 + hazard.s1) / 2, 3, 0);
      this.group.add(slab);
      this.gust = slab;
    }
  }

  update(time: number): string {
    hazardObstacles([this.hazard], time, this.obstacles);
    this.pillars.forEach((m, i) => {
      const o = this.obstacles[i];
      m.visible = !!o;
      if (o) {
        m.position.set(o.s, 0, o.x);
        m.scale.set(o.radius, o.height, o.radius);
      }
    });
    if (this.gust) {
      const mid = (this.hazard.s0 + this.hazard.s1) / 2;
      const push = gustAt([this.hazard], mid, time);
      const d = this.hazard.def;
      (this.gust.material as THREE.MeshBasicMaterial).opacity = d.type === 'gust' ? (0.35 * Math.abs(push)) / Math.abs(d.strength) : 0;
      return `gust ${push.toFixed(1)} m/s²`;
    }
    return `${this.obstacles.length} obstacles`;
  }
}
