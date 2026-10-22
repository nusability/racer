// Set B landmarks: people and places. Each kind lives in its own module under ./b/.

import * as THREE from 'three';
import type { LandmarkFactory, LandmarkOptions } from './types.ts';
import { createBazaar } from './b/bazaar.ts';
import { createFair } from './b/fair.ts';
import { createGrandstand } from './b/grandstand.ts';
import { createOasisTown } from './b/oasisTown.ts';
import { createCliffVillage } from './b/cliffVillage.ts';
import { createColossus } from './b/colossus.ts';

type SetBKind =
  | 'bazaar'
  | 'fair'
  | 'grandstand'
  | 'oasisTown'
  | 'cliffVillage'
  | 'colossus'
  | 'windfarm'
  | 'balloons';

function placeholder(w: number, h: number, d: number): LandmarkFactory {
  return (opts: LandmarkOptions) => {
    const geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ color: opts.palette.accent });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, mat));
    return {
      group,
      radius: Math.hypot(w, d) / 2,
      update: () => {},
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    };
  };
}

export const LANDMARKS_B: Record<SetBKind, LandmarkFactory> = {
  bazaar: createBazaar,
  fair: createFair,
  grandstand: createGrandstand,
  oasisTown: createOasisTown,
  cliffVillage: createCliffVillage,
  colossus: createColossus,
  windfarm: placeholder(400, 120, 260),
  balloons: placeholder(400, 300, 400),
};
