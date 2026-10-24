// A stack of glowing, downward-pointing chevrons floating over each boost pad's leading
// section. A pad lies flat on the road, so from the low chase camera it foreshortens to a
// sliver until it is already under the nose; a tall stack of "V"s at head height reads from far
// away, and blinking top to bottom in quick sequence it says "down, onto this pad". They are
// solid prisms rather than flat cut-outs, so they keep their shape seen from the side and in
// banked corners, and they are light only: racers fly straight through them.
//
// No light posts: the stack stands as tall as they did and glows, so it already shows over a
// crest or round a bend; posts only cluttered the silhouette.
//
// Every chevron on every ribbon is one mesh and one draw call. The bob and the blink run in the
// vertex shader off one time uniform, so a frame costs no CPU geometry work.

import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';

/** Chevrons per stack. */
const CHEVRON_COUNT = 3;
/** Metres from the pad's leading edge to the stack: over the pad, where the racer should aim. */
const STACK_INSET = 3;
/** Height of the lowest chevron's point above the road: clear of a craft's canopy. */
const STACK_BASE = 3;
/** Vertical distance between stacked chevrons: about two arm thicknesses, so they nest with a clear gap. */
const CHEVRON_PITCH = 1.9;
/** Span of a chevron as a share of the pad's width: a little wider than the pad, so it frames it. */
const CHEVRON_WIDTH_SHARE = 1.15;
/** How far the point hangs below the tips: a "V" of about 120°, wide enough to read as one shape from 150 m. */
const CHEVRON_DROP = 2.5;
/** Thickness of an arm, measured vertically. */
const CHEVRON_THICKNESS = 0.9;
/** Depth of the prism along the road: enough to stay a solid shape seen edge-on from the side. */
const CHEVRON_DEPTH = 0.9;
/** Headroom kept under a tunnel ceiling: a stack that would reach it is squeezed down to fit. */
const CEILING_MARGIN = 1;

/** The pad's cyan, saturated: a pale glow vanishes against sunlit sand and sky, a saturated hue does not. */
const BEACON_COLOR = new THREE.Color(0x12d8ff);
/**
 * Brightness of a chevron at the peak of its blink: well above every world's bloom threshold
 * (the brightest is 1.5, sunlit snow), so the lit chevron flares on the look pass.
 */
const BLINK_PEAK = 3.2;
/** Brightness between blinks, so a chevron never vanishes: still a solid cyan by day, a glow at night. */
const BLINK_DIM = 1.1;
/** Seconds for the light to run once down the stack: quick enough to read as motion, not as three lamps. */
const BLINK_PERIOD = 0.6;
/** Gentle bob of the whole stack along the road's up, metres, and its rate (Hz). */
const BOB_AMPLITUDE = 0.35;
const BOB_RATE = 0.8;

/** Face shading: the faces toward and away from the racer brightest, the arms' edges darker, so the prism reads as solid. */
const SHADE_CAP = 1;
const SHADE_TOP = 0.75;
const SHADE_UNDER = 0.5;
const SHADE_END = 0.85;

export interface PadBeacons {
  mesh: THREE.Mesh | null;
  update(time: number): void;
  dispose(): void;
}

/** Chevron outline in (lateral, height) around its point, counter-clockwise from the lower left tip. */
function outline(half: number): [number, number][] {
  const t = CHEVRON_THICKNESS;
  const d = CHEVRON_DROP;
  return [
    [-half, d],
    [0, 0],
    [half, d],
    [half, d + t],
    [0, t],
    [-half, d + t],
  ];
}

/** Shade of the wall along outline edge i → i+1: lower edges face down, upper edges up, tips sideways. */
const EDGE_SHADE = [SHADE_UNDER, SHADE_UNDER, SHADE_END, SHADE_TOP, SHADE_TOP, SHADE_END];

export function buildPadBeacons(ribbons: readonly Ribbon[]): PadBeacons {
  const pos: number[] = [];
  const col: number[] = [];
  /** xyz: the road's up at the pad (the bob's direction); w: the chevron's place in the blink, 0 at the top. */
  const beacon: number[] = [];
  const c = new THREE.Color();
  for (const r of ribbons) {
    for (const p of r.boostPads) {
      const sc = p.s - p.length / 2 + STACK_INSET;
      const up = r.frameAt(sc).up;
      const shape = outline((p.width * CHEVRON_WIDTH_SHARE) / 2);
      const stackTop = STACK_BASE + (CHEVRON_COUNT - 1) * CHEVRON_PITCH + CHEVRON_DROP + CHEVRON_THICKNESS + BOB_AMPLITUDE;
      const room = r.ceilingAt(sc) - CEILING_MARGIN;
      // Under a low ceiling the stack's heights shrink about the road; in the open it keeps its size.
      const squeeze = Math.min(1, room / stackTop);
      if (squeeze <= 0) throw new Error(`pad beacons: the ceiling at s=${sc.toFixed(0)} leaves no room for a chevron stack`);
      for (let k = 0; k < CHEVRON_COUNT; k++) {
        const base = STACK_BASE + k * CHEVRON_PITCH;
        const slot = CHEVRON_COUNT - 1 - k;
        const at = (i: number, ds: number) => {
          const [x, y] = shape[i];
          return r.toWorld(sc + ds, p.x + x, (base + y) * squeeze);
        };
        const tri = (a: THREE.Vector3Like, b: THREE.Vector3Like, d: THREE.Vector3Like, shade: number) => {
          c.copy(BEACON_COLOR).multiplyScalar(shade);
          for (const v of [a, b, d]) {
            pos.push(v.x, v.y, v.z);
            col.push(c.r, c.g, c.b);
            beacon.push(up.x, up.y, up.z, slot);
          }
        };
        const front = (i: number) => at(i, -CHEVRON_DEPTH / 2);
        const back = (i: number) => at(i, CHEVRON_DEPTH / 2);
        // The two caps, each as two arm quads.
        for (const face of [front, back]) {
          tri(face(0), face(1), face(4), SHADE_CAP);
          tri(face(0), face(4), face(5), SHADE_CAP);
          tri(face(1), face(2), face(3), SHADE_CAP);
          tri(face(1), face(3), face(4), SHADE_CAP);
        }
        // The walls round the outline.
        for (let i = 0; i < shape.length; i++) {
          const j = (i + 1) % shape.length;
          tri(front(i), front(j), back(j), EDGE_SHADE[i]);
          tri(front(i), back(j), back(i), EDGE_SHADE[i]);
        }
      }
    }
  }
  const uniforms = {
    uTime: { value: 0 },
    uBob: { value: BOB_AMPLITUDE },
    uBobOmega: { value: 2 * Math.PI * BOB_RATE },
    uBlinkRate: { value: 1 / BLINK_PERIOD },
    uBlinkPeak: { value: BLINK_PEAK },
    uBlinkDim: { value: BLINK_DIM },
    uSlots: { value: CHEVRON_COUNT },
  };
  // Closed prisms, but double-sided so the winding of the ribbon's frame never matters.
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aBeacon;
uniform float uTime;
uniform float uBob;
uniform float uBobOmega;
uniform float uBlinkRate;
uniform float uBlinkPeak;
uniform float uBlinkDim;
uniform float uSlots;`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aBeacon.xyz * (uBob * sin(uTime * uBobOmega));')
      .replace(
        '#include <color_vertex>',
        // The flash runs down the stack: slot 0 (the top) lights first, then each one below,
        // each fading over the rest of the cycle with a cubic tail.
        `#include <color_vertex>
float since = fract(uTime * uBlinkRate - aBeacon.w / uSlots);
vColor.rgb *= mix(uBlinkDim, uBlinkPeak, pow(1.0 - since, 3.0));`,
      );
  };
  mat.customProgramCacheKey = () => 'padBeacons';
  let geo: THREE.BufferGeometry | null = null;
  let mesh: THREE.Mesh | null = null;
  if (pos.length > 0) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aBeacon', new THREE.Float32BufferAttribute(beacon, 4));
    geo.computeBoundingSphere();
    mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'padBeacons';
    mesh.matrixAutoUpdate = false;
  }
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geo?.dispose();
      mat.dispose();
    },
  };
}
