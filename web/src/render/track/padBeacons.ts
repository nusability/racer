// Holographic chevrons hovering over each boost pad. A pad lies flat on the road, so from the
// low chase camera it foreshortens to a sliver until it is already under the nose; upright
// chevrons at head height, flanked by two tall light posts, read from far away and say
// "this way, now". They are light only:
// racers fly straight through them.

import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import { SmoothBuilder } from './builder.ts';

/** Chevrons per pad, spread along it from its leading edge. */
const BEACON_COUNT = 3;
/** Metres between chevrons along the pad (the pad is 24 m long). */
const BEACON_SPACING = 7;
/** Height of the chevron's lowest point above the road: above a craft's canopy, below tunnel roofs. */
const BEACON_BASE = 2.5;
/** Apex height above the base. */
const BEACON_RISE = 2.6;
/** Thickness of a chevron arm, measured vertically. */
const BEACON_THICKNESS = 0.95;
/** Share of the pad's width a chevron spans: a little wider than the pad, so it reads from afar. */
const BEACON_WIDTH_SHARE = 1.15;
/**
 * The pad's cyan, saturated: a pale or additive glow vanishes against sunlit sand and sky,
 * a solid saturated hue does not.
 */
const BEACON_COLOR = 0x12d8ff;
/** Mostly solid; a little see-through so it still feels like a hologram. */
const BEACON_OPACITY = 0.9;
/** Light posts at the pad's corners: tall enough to show over a crest or a bend from far away. */
const POST_HEIGHT = 9;
const POST_WIDTH = 0.8;
/** Pulses per second running forward through a pad's chevrons. */
const BEACON_PULSE_RATE = 1.6;
/** Brightness between pulses, so a chevron never vanishes. */
const BEACON_DIM = 0.55;
/** Pulse texture resolution; only its 1D profile matters. */
const PULSE_TEXELS = 64;

export interface PadBeacons {
  mesh: THREE.Mesh | null;
  update(time: number): void;
  dispose(): void;
}

/**
 * Each chevron's vertices share one u (its place in the row), sampled from a scrolling 1D
 * pulse texture: the row lights up front-to-back like runway lights without per-frame CPU work.
 */
export function buildPadBeacons(ribbons: readonly Ribbon[]): PadBeacons {
  const b = new SmoothBuilder();
  const white = new THREE.Color(1, 1, 1);
  for (const r of ribbons) {
    for (const p of r.boostPads) {
      const half = (p.width * BEACON_WIDTH_SHARE) / 2;
      for (let i = 0; i < BEACON_COUNT; i++) {
        const s = p.s - p.length / 2 + i * BEACON_SPACING;
        // Later chevrons sit later in the pulse, so the light runs the way the racer goes.
        const u = -i / BEACON_COUNT;
        const at = (x: number, y: number) => b.vertex(r.toWorld(s, p.x + x, y), white, u, 0);
        const lo = BEACON_BASE;
        const top = BEACON_BASE + BEACON_RISE;
        // Two arms meeting at the apex: outer edge then inner edge, left tip → apex → right tip.
        const a0 = at(-half, lo);
        const a1 = at(-half, lo + BEACON_THICKNESS);
        const a2 = at(0, top);
        const a3 = at(0, top + BEACON_THICKNESS);
        const a4 = at(half, lo);
        const a5 = at(half, lo + BEACON_THICKNESS);
        b.tri(a0, a2, a3);
        b.tri(a0, a3, a1);
        b.tri(a2, a4, a5);
        b.tri(a2, a5, a3);
      }
      // Posts at the pad's leading corners, lit with the first chevron.
      const s0 = p.s - p.length / 2;
      for (const side of [-1, 1]) {
        const x = p.x + side * half;
        const at = (dx: number, y: number) => b.vertex(r.toWorld(s0, x + dx, y), white, 0, 0);
        const q0 = at(-POST_WIDTH / 2, 0);
        const q1 = at(POST_WIDTH / 2, 0);
        const q2 = at(POST_WIDTH / 2, POST_HEIGHT);
        const q3 = at(-POST_WIDTH / 2, POST_HEIGHT);
        b.tri(q0, q1, q2);
        b.tri(q0, q2, q3);
      }
    }
  }
  const geo = b.build(true);
  const tex = pulseTexture();
  const mat = new THREE.MeshBasicMaterial({
    color: BEACON_COLOR,
    map: tex,
    transparent: true,
    opacity: BEACON_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = geo ? new THREE.Mesh(geo, mat) : null;
  if (mesh) {
    mesh.name = 'padBeacons';
    mesh.matrixAutoUpdate = false;
  }
  return {
    mesh,
    update(time) {
      tex.offset.x = time * BEACON_PULSE_RATE;
    },
    dispose() {
      geo?.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

/** One bright pulse with a soft tail over a dim floor, repeating along u. */
function pulseTexture(): THREE.DataTexture {
  const data = new Uint8Array(PULSE_TEXELS * 4);
  for (let i = 0; i < PULSE_TEXELS; i++) {
    const t = i / PULSE_TEXELS;
    const level = BEACON_DIM + (1 - BEACON_DIM) * Math.pow(1 - t, 3);
    const v = Math.round(level * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, PULSE_TEXELS, 1);
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
