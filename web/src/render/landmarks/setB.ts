// Set B landmarks: people and places. Each kind lives in its own module under ./b/.

import * as THREE from 'three';
import type { LandmarkFactory, LandmarkOptions } from './types.ts';

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
  bazaar: placeholder(300, 20, 120),
  fair: placeholder(260, 70, 200),
  grandstand: placeholder(320, 45, 70),
  oasisTown: placeholder(300, 30, 260),
  cliffVillage: placeholder(260, 160, 160),
  colossus: placeholder(200, 160, 200),
  windfarm: placeholder(400, 120, 260),
  balloons: placeholder(400, 300, 400),
};
