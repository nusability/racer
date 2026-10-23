// Set D landmarks: the ice world, Frostline. Each kind lives in its own module under ./d/.

import * as THREE from 'three';
import type { Landmark, LandmarkFactory } from './types.ts';

type SetDKind = 'icebreaker' | 'avalancheSlope' | 'glacierWall' | 'mammothHerd' | 'iceStation' | 'skiJump' | 'icePalace' | 'frozenFalls' | 'auroraSky' | 'snowcatConvoy';

/** Temporary stand-in so the registry is complete while the real set is built. */
function placeholder(color: number): LandmarkFactory {
  return (): Landmark => {
    const geo = new THREE.BoxGeometry(60, 40, 60);
    geo.translate(0, 20, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, mat));
    return { group, radius: 45, update() {}, dispose() { geo.dispose(); mat.dispose(); } };
  };
}

export const LANDMARKS_D: Record<SetDKind, LandmarkFactory> = {
  icebreaker: placeholder(0xc03030),
  avalancheSlope: placeholder(0xf0f4ff),
  glacierWall: placeholder(0x7fc8f0),
  mammothHerd: placeholder(0x8a5a3a),
  iceStation: placeholder(0xff8a20),
  skiJump: placeholder(0xd0d8e0),
  icePalace: placeholder(0xa0e0ff),
  frozenFalls: placeholder(0xc8f0ff),
  auroraSky: placeholder(0x40ffa0),
  snowcatConvoy: placeholder(0xf0c020),
};
