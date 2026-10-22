// Set A landmarks: machines and spectacle. Placeholder boxes until each real build lands.

import * as THREE from 'three';
import type { Landmark, LandmarkFactory, LandmarkOptions } from './types.ts';

type SetAKind = 'spaceport' | 'invasion' | 'wreck' | 'skyfleet' | 'mine' | 'stormwall' | 'sandbeast';

function placeholder(w: number, h: number, d: number): LandmarkFactory {
  return (opts: LandmarkOptions): Landmark => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
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

export const LANDMARKS_A: Record<SetAKind, LandmarkFactory> = {
  spaceport: placeholder(400, 60, 300),
  invasion: placeholder(500, 40, 400),
  wreck: placeholder(450, 80, 120),
  skyfleet: placeholder(300, 20, 300),
  mine: placeholder(400, 70, 300),
  stormwall: placeholder(3000, 400, 200),
  sandbeast: placeholder(300, 60, 100),
};
