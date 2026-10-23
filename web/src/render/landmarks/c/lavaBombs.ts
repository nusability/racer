// The volcano as a dropper hazard: each scheduled item is a lava bomb thrown from the crater
// that lands exactly on its spot on the course at the end of its warning, trailing fire. The
// track scene draws the landed bomb and the warning shadow; this draws the flight.

import * as THREE from 'three';
import type { Kit } from '../b/kit.ts';
import type { V3 } from '../b/motion.ts';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import type { HazardBinding } from '../types.ts';
import { HIDDEN, Sprites, type HazardOf } from './hazard.ts';

/** Arc height above the higher end, as a share of the horizontal throw. */
const ARC = 0.32;
const TRAIL = { high: 26, low: 13 } as const;
/** Spacing of the trail's puffs, in flight progress. */
const TRAIL_STEP = 0.009;
const SPIN = 5;
const BOMB_HOT = 0xffb030;
/** Fire at the head of the trail cooling to smoke: opaque sprites, so they read against a bright sky. */
const TRAIL_COLOURS = [0xffd060, 0xff8a20, 0xe04a10, 0x8a5a4a, 0x5a5050];
/** In flight a bomb is drawn this much larger (it shrinks to its true size at impact), so it reads from afar. */
const FLIGHT_GROWTH = 4;
const TRAIL_SIZE = 5;

export function lavaBombs(kit: Kit, bound: { binding: HazardBinding; hazard: HazardOf<'dropper'> }, crater: V3): (time: number) => void {
  const { binding, hazard } = bound;
  const d = hazard.def;
  const n = d.count;
  const items: DropItem[] = [];
  // Bombs are sized in track metres: measure how long a track metre is here.
  const o = binding.toLocal(hazard.s0, 0, 0, new THREE.Vector3());
  const metre = binding.toLocal(hazard.s0, 1, 0, new THREE.Vector3()).distanceTo(o);
  const bombR = d.radius * metre;

  const mat = new THREE.MeshBasicMaterial({ color: BOMB_HOT });
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const bombs = new THREE.InstancedMesh(geo, mat, n);
  bombs.name = 'lavaBombs';
  bombs.frustumCulled = false;
  bombs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const k = kit.q(TRAIL.high, TRAIL.low);
  const trail = new Sprites(n * k, false, 1.2, 'bombTrails');
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) trail.style(i * k + j, TRAIL_COLOURS[Math.min(TRAIL_COLOURS.length - 1, Math.floor((j / k) * TRAIL_COLOURS.length))], bombR * TRAIL_SIZE * (0.6 + (0.8 * j) / k));
  kit.addObject(bombs, geo, mat);
  kit.addObject(trail.points, trail);

  const from = new THREE.Vector3(...crater);
  const land = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const m = new THREE.Matrix4();

  /** Where a bomb flying from the crater to `land` is at progress t (0 launch, 1 impact). */
  const flight = (t: number, out: THREE.Vector3): THREE.Vector3 => {
    const throwLen = Math.hypot(land.x - from.x, land.z - from.z);
    const top = Math.max(from.y, land.y) + ARC * throwLen;
    // A parabola through both ends whose peak clears `top`.
    const lift = 4 * (top - (from.y + land.y) / 2) * t * (1 - t);
    return out.lerpVectors(from, land, t).setY(from.y + (land.y - from.y) * t + lift);
  };

  return (time) => {
    dropperItems(hazard, time, items);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (it.stage !== 'warn') {
        bombs.setMatrixAt(i, HIDDEN);
        for (let j = 0; j < k; j++) trail.hide(i * k + j);
        continue;
      }
      binding.toLocal(it.s, it.x, d.radius, land);
      flight(it.progress, p);
      q.setFromEuler(e.set(time * SPIN + i, time * SPIN * 0.7, i));
      sc.setScalar(bombR * (1 + FLIGHT_GROWTH * (1 - it.progress)));
      bombs.setMatrixAt(i, m.compose(p, q, sc));
      for (let j = 0; j < k; j++) {
        const t = it.progress - (j + 1) * TRAIL_STEP;
        if (t <= 0) trail.hide(i * k + j);
        else trail.place(i * k + j, flight(t, p), 0.9 - (0.6 * j) / k);
      }
    }
    bombs.instanceMatrix.needsUpdate = true;
    trail.commit();
  };
}
