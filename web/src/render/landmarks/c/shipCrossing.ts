// The cruise liner as a blocker hazard: the ship steams along a channel that cuts the course,
// stops across the road for the 'down' stage with its bow at the edge of the opening (racers
// thread past the stem), then steams on. If the opening leaves road on both sides, a tug
// shoves a barge across the other part. Ship and barge are placed with the binding each frame.

import * as THREE from 'three';
import type { Kit } from '../b/kit.ts';
import { Bucket } from '../b/bucket.ts';
import { solidMaterial } from '../b/motion.ts';
import { box } from '../b/shapes.ts';
import { blockerStage } from '../../../core/hazards.ts';
import { HAZARD_BAR_RADIUS } from '../../../data/tuning.ts';
import type { HazardBinding, Landmark } from '../types.ts';
import { DARK, GLASS, WHITE, hull } from './kit.ts';
import { HIDDEN, mover, type HazardOf } from './hazard.ts';

/** How far (track metres, beyond the ship's own length) it sails in and out of view. */
const TRAVEL_EXTRA = 220;
/** The barge reaches this far past each end of the road it closes. */
const BARGE_OVERLAP = 4;
const BARGE = { len: 24, beam: 10, depth: 5 } as const;

/**
 * Moves the finished liner (all of `lm`'s draws) as the hazard's ship. `length` is the ship's
 * length in its own units, bow along +X, waterline at y = 0.
 */
export function shipCrossing(kit: Kit, lm: Landmark, bound: { binding: HazardBinding; hazard: HazardOf<'blocker'> }, length: number): (time: number) => void {
  const { binding, hazard } = bound;
  const d = hazard.def;
  const ship = new THREE.Group();
  ship.name = 'ship';
  ship.matrixAutoUpdate = false;
  ship.add(...lm.group.children);
  lm.group.add(ship);

  // The road's directions here, as unit vectors, and how long a track metre is locally.
  const o = binding.toLocal(hazard.s0, 0, 0, new THREE.Vector3());
  const ex = binding.toLocal(hazard.s0, 1, 0, new THREE.Vector3()).sub(o);
  const metre = ex.length();
  ex.normalize();
  const ey = binding.toLocal(hazard.s0, 0, 1, new THREE.Vector3()).sub(o).normalize();
  const es = new THREE.Vector3().crossVectors(ex, ey);

  // Close the larger blocked stretch with the liner's bow; the barge takes the other.
  const openMin = d.offset - d.opening / 2;
  const openMax = d.offset + d.opening / 2;
  const below = openMin - hazard.minX;
  const above = hazard.maxX - openMax;
  const dir = below >= above ? 1 : -1;
  const bowX = dir > 0 ? openMin : openMax;
  const shipLen = length / metre;
  const shipRest = bowX - (dir * shipLen) / 2;
  const travel = shipLen + TRAVEL_EXTRA;
  const turn = new THREE.Matrix4().makeBasis(ex.clone().multiplyScalar(dir), ey, es.clone().multiplyScalar(dir));

  const other = dir > 0 ? above : below;
  const needBarge = other > HAZARD_BAR_RADIUS;
  const bargeLen = other + 2 * BARGE_OVERLAP;
  const bargeRest = dir > 0 ? hazard.maxX - other / 2 : hazard.minX + other / 2;
  let barge: THREE.Mesh | undefined;
  if (needBarge) {
    // Built in track metres along +X, then stretched to the gap it fills.
    const b = new Bucket({});
    b.add(box(1, BARGE.depth, BARGE.beam), 0x6a4a3a, new THREE.Matrix4().makeTranslation(0, -BARGE.depth / 2, 0));
    b.add(box(0.96, 0.4, BARGE.beam - 1), 0xf2a33a, new THREE.Matrix4().makeTranslation(0, BARGE.depth / 2, 0));
    const geo = b.geometry();
    const tb = new Bucket({});
    tb.add(hull(BARGE.len, 8, 5, 0.35, 0.9), 0xb8302a, new THREE.Matrix4().makeTranslation(0, -3, 0));
    tb.add(box(6, 3.6, 5.4), WHITE, new THREE.Matrix4().makeTranslation(1, 2, 0));
    tb.add(box(6.4, 1.1, 5.8), GLASS, new THREE.Matrix4().makeTranslation(1, 4.6, 0));
    tb.add(box(1, 3.2, 1), DARK, new THREE.Matrix4().makeTranslation(-3, 3, 0));
    const tugGeo = tb.geometry();
    const mat = solidMaterial(kit.u, false);
    barge = mover(geo, mat, 'barge');
    const tug = mover(tugGeo, mat, 'tug');
    kit.addObject(barge, geo, mat);
    kit.addObject(tug, tugGeo);
    barge.userData.tug = tug;
  }

  const p = new THREE.Vector3();
  const stretch = new THREE.Matrix4();
  // Barge and tug are built in track metres: bases scaled to one track metre, facing −dir.
  const facing = -dir;
  const metreBasis = new THREE.Matrix4().makeBasis(ex.clone().multiplyScalar(facing * metre), ey.clone().multiplyScalar(metre), es.clone().multiplyScalar(facing * metre));
  /** Places a body at track x on the water line, `offset` track metres ahead of it. */
  const place = (obj: THREE.Object3D, x: number, scaleX: number, offset: number): void => {
    binding.toLocal(hazard.s0, x + offset * facing, 0, p);
    p.y = 0;
    obj.matrix.copy(metreBasis).multiply(stretch.makeScale(scaleX, 1, 1)).setPosition(p);
    obj.matrixWorldNeedsUpdate = true;
  };

  /** Track-x offset from the rest position: arriving decelerates, leaving accelerates. */
  const shift = (time: number): number => {
    const st = blockerStage(d, time);
    if (st.stage === 'warn') return -travel * (1 - st.progress) ** 2;
    if (st.stage === 'down') return 0;
    return travel * st.progress ** 2;
  };

  return (time) => {
    const dx = shift(time);
    binding.toLocal(hazard.s0, shipRest + dir * dx, 0, p);
    p.y = 0;
    ship.matrix.copy(turn).setPosition(p);
    ship.matrixWorldNeedsUpdate = true;
    if (barge) {
      // The barge comes from the opposite bank, so the two close the road like a pincer.
      const bx = bargeRest - dir * dx;
      place(barge, bx, bargeLen, 0);
      const tug = barge.userData.tug as THREE.Mesh;
      place(tug, bx, 1, -(bargeLen / 2 + BARGE.len / 2 - 2));
      if (Math.abs(dx) > travel * 0.98) {
        barge.matrix.copy(HIDDEN);
        tug.matrix.copy(HIDDEN);
      }
    }
  };
}
