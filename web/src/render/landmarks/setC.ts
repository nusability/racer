// Set C landmarks: the coast. Each kind lives in its own module under ./c/.

import * as THREE from 'three';
import type { Landmark, LandmarkFactory, LandmarkOptions } from './types.ts';
import { createLighthouse } from './c/lighthouse.ts';
import { createVolcano } from './c/volcano.ts';
import { createHarbor } from './c/harbor.ts';
import { createResort } from './c/resort.ts';
import { createRegatta } from './c/regatta.ts';
import { createCruiseliner } from './c/cruiseliner.ts';
import { createPier } from './c/pier.ts';

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
  lighthouse: createLighthouse,
  pier: createPier,
  cruiseliner: createCruiseliner,
  regatta: createRegatta,
  resort: createResort,
  harbor: createHarbor,
  volcano: createVolcano,
  whales: box(250, 30, 250),
  beachParty: box(200, 30, 150),
  airshow: box(400, 200, 400),
};
