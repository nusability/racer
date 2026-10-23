// Set C landmarks: the coast. Each kind lives in its own module under ./c/.

import * as THREE from 'three';
import type { Landmark, LandmarkFactory, LandmarkOptions } from './types.ts';

type SetCKind = 'lighthouse' | 'pier' | 'cruiseliner' | 'regatta' | 'resort' | 'harbor' | 'volcano' | 'whales' | 'beachParty' | 'airshow';

function box(w: number, h: number, d: number) {
  return (opts: LandmarkOptions): Landmark => {
    const geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ color: opts.palette.accent });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, mat));
    return { group, radius: Math.hypot(w, d) / 2, update() {}, dispose() { geo.dispose(); mat.dispose(); } };
  };
}

export const LANDMARKS_C: Record<SetCKind, LandmarkFactory> = {
  lighthouse: box(40, 60, 40),
  pier: box(40, 50, 300),
  cruiseliner: box(320, 60, 45),
  regatta: box(300, 30, 300),
  resort: box(250, 90, 150),
  harbor: box(300, 70, 200),
  volcano: box(900, 350, 900),
  whales: box(250, 30, 250),
  beachParty: box(200, 30, 150),
  airshow: box(400, 200, 400),
};
