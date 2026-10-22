import * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';
import type { FlatBuilder, P3 } from './builder.ts';

// Colour recipes shared by every piece of rock, so walls, mesas, arches and pillars read as
// one geology.

/** Thickness of one sandstone stratum, metres. */
const STRATUM = 4.2;

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export interface Paint {
  palette: TrackPalette;
  rock: THREE.Color;
  rockDark: THREE.Color;
  rockLight: THREE.Color;
  accent: THREE.Color;
  white: THREE.Color;
  black: THREE.Color;
  hazard: THREE.Color;
  sand: THREE.Color;
  /** Banded sandstone at absolute height y; `shade` darkens (ambient occlusion, interiors). */
  strata(y: number, shade: number, out: THREE.Color): THREE.Color;
}

export function makePaint(palette: TrackPalette): Paint {
  const rock = new THREE.Color(palette.rock);
  const rockDark = rock.clone().multiplyScalar(0.62);
  const rockLight = rock.clone().lerp(new THREE.Color(palette.sand), 0.45);
  const warm = new THREE.Color(palette.sand);
  return {
    palette,
    rock,
    rockDark,
    rockLight,
    accent: new THREE.Color(palette.accent),
    white: new THREE.Color(0xf4f0e8),
    black: new THREE.Color(0x1a1410),
    hazard: new THREE.Color(0xffc21a),
    sand: new THREE.Color(palette.sand),
    strata(y, shade, out) {
      const band = Math.floor(y / STRATUM);
      const h = hash(band);
      out.copy(rock);
      if (h > 0.72) out.lerp(rockLight, 0.55);
      else if (h < 0.22) out.lerp(rockDark, 0.6);
      else if (h > 0.5) out.lerp(warm, 0.18);
      return out.multiplyScalar(shade * (0.92 + 0.12 * hash(band + 0.5)));
    },
  };
}

/** Adds a quad, flipping its winding when needed so its front faces `dir`. */
export function quadFacing(
  b: FlatBuilder,
  a: P3,
  c1: P3,
  c2: P3,
  d: P3,
  dir: P3,
  ca: THREE.Color,
  cb: THREE.Color = ca,
  cc: THREE.Color = cb,
  cd: THREE.Color = ca,
): void {
  const ux = c1.x - a.x;
  const uy = c1.y - a.y;
  const uz = c1.z - a.z;
  const vx = c2.x - a.x;
  const vy = c2.y - a.y;
  const vz = c2.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (nx * dir.x + ny * dir.y + nz * dir.z >= 0) {
    b.tri(a, c1, c2, ca, cb, cc);
    b.tri(a, c2, d, ca, cc, cd);
  } else {
    b.tri(a, c2, c1, ca, cc, cb);
    b.tri(a, d, c2, ca, cd, cc);
  }
}

/** Rock faces taller than this are split into bands so the strata show as flat colour bands. */
const STRATA_BAND = 7;

function lerpP(a: P3, b: P3, t: number): P3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * A rock quad (a, b along the bottom, c, d along the top: a-b-c-d) split into horizontal bands,
 * each painted with the stratum at its height, so tall cliffs read as layered sandstone.
 */
export function rockQuad(bld: FlatBuilder, paint: Paint, a: P3, b: P3, c: P3, d: P3, dir: P3, shade: number): void {
  const rise = Math.max(Math.abs(d.y - a.y), Math.abs(c.y - b.y));
  const bands = Math.max(1, Math.ceil(rise / STRATA_BAND));
  const col = new THREE.Color();
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const p0 = lerpP(a, d, t0);
    const p1 = lerpP(b, c, t0);
    const p2 = lerpP(b, c, t1);
    const p3 = lerpP(a, d, t1);
    paint.strata((p0.y + p2.y) / 2, shade * (0.9 + 0.1 * t1), col);
    quadFacing(bld, p0, p1, p2, p3, dir, col);
  }
}
