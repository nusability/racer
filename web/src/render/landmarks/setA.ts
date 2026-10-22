// Set A landmarks: machines and spectacle. Placeholder boxes until each real build lands.

import * as THREE from 'three';
import type { Landmark, LandmarkFactory, LandmarkOptions } from './types.ts';
import { createSpaceport } from './a/spaceport.ts';
import { createInvasion } from './a/invasion.ts';
import { createWreck } from './a/wreck.ts';
import { createSkyfleet } from './a/skyfleet.ts';
import { createMine } from './a/mine.ts';
import { createStormwall } from './a/stormwall.ts';

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
  spaceport: createSpaceport,
  invasion: createInvasion,
  wreck: createWreck,
  skyfleet: createSkyfleet,
  mine: createMine,
  stormwall: createStormwall,
  sandbeast: placeholder(300, 60, 100),
};
