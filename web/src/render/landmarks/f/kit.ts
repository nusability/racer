// Space kit for the set-F landmarks (Orbital Reach). They are built with the ice world's rig kit
// (set-B buckets for static parts, a set-A rig for anything posed from a hazard or the road, CPU
// point clouds for event-driven gas and sparks): that machinery is biome-neutral. This adds the
// station's colours and the one rule space imposes: nothing stands on ground. A landmark's
// local y = 0 is the deck's level (render/track/landmarks.ts places a close landmark flush with
// the road edge), so its structure hangs round that level and is braced back to the deck.

import * as THREE from 'three';
import { T } from '../b/shapes.ts';
import type { IceKit } from '../d/kit.ts';

export { IceKit as RigKit, RoadFrame, bindHazard, blockedSpans, hide, smooth01 } from '../d/kit.ts';

// --- Geometry: centred on the origin (set B's box and prism stand on y = 0) -------------------

/** A box centred on the origin. */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** A prism (a cylinder of `sides` faces) centred on the origin, its axis along y. */
export function prism(rBottom: number, rTop: number, h: number, sides: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, sides);
}

// --- Palette ------------------------------------------------------------------------------

/** Station hull plating, its darker frame steel and the black of open hatches. */
export const HULL = 0x8a909a;
export const FRAME = 0x4c525c;
export const DARK = 0x16181e;
/** Hazard striping and warning lamps. */
export const HAZARD = 0xf2b418;
export const AMBER = 0xffa020;
export const RED_LIGHT = 0xff3030;
/** Working lamps: cold white floods, and the cyan of the station's running lights. */
export const FLOOD = 0xeef4ff;
export const CYAN = 0x38d8ff;

/** A station module hung beside the deck: a hull box (top at `y`, centred on x and z), a frame band and a lit window band. */
export function hullModule(kit: IceKit['b'], x: number, y: number, z: number, w: number, h: number, d: number, accent: THREE.ColorRepresentation): void {
  kit.solid.add(box(w, h, d), HULL, T(x, y - h / 2, z));
  kit.solid.add(box(w + 0.4, 0.6, d + 0.4), FRAME, T(x, y - h / 2 + h * 0.25, z));
  kit.lights.add(box(w * 0.8, 0.5, d + 0.1), accent, T(x, y - h / 2 + h * 0.6, z));
}

/**
 * A strut bone from the landmark toward the road: posed each frame from `from` (local, the
 * landmark's near face) to the hard boundary at `road`'s cross-section, so the landmark is
 * visibly bolted to the deck it hangs beside whatever its placement distance.
 */
export function brace(rig: IceKit['rig']): THREE.Bone {
  const bone = rig.bone();
  rig.add(box(1, 1, 1).translate(0.5, 0, 0), FRAME, { bone });
  rig.add(box(1, 0.12, 1.02).translate(0.5, 0.45, 0), HAZARD, { bone, layer: 'glow' });
  return bone;
}

/** Poses a brace bone from `from` to `to` (local points), `thick` metres square at `unit` local units per metre. */
export function poseBrace(bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3, thick: number, unit: number): void {
  _d.subVectors(to, from);
  const len = _d.length();
  bone.position.copy(from);
  bone.quaternion.setFromUnitVectors(_x, _d.normalize());
  bone.scale.set(len, thick * unit, thick * unit);
}
const _d = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
