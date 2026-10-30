import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import type { RacerState } from '../../core/types.ts';
import { RACER_HALF_WIDTH, RACER_HEIGHT, RACER_LENGTH, SPRINT_FIELD_DEPTH } from '../../data/tuning.ts';
import { mulberry32 } from '../../core/rng.ts';
import type { Quality } from './config.ts';

// The force field filling the end of a sprint's run-out (the race holds finishers in it:
// core/race.ts): a block of magnetic field lines across the road, drawn as crisp glowing motes
// streaming along them. The lines arch from pole to pole across the course in nested, boxy
// loops, one set every few metres down the block's depth, with straight lines across the road
// low down where the gliders fly (the loops are open underneath), so the block reads as a lattice of
// light with a faint bounding shell (its outermost loops), never as a wall or a cloud. Where a
// glider pushes in, the lattice parts round its nose and packs into a bright shell round it,
// the motes streak past it as fast as it goes, and sparks crawl over its hull while the field
// bleeds its speed away. Tinted by the world's accent.
//
// One instanced draw: every mote and spark is a camera-facing streak whose motion runs in the
// vertex shader from a handful of uniforms (time, the racers' places and speeds); the CPU
// writes those few numbers a frame.

/** Racers the shader takes (a race has six). */
const MAX_RACERS = 8;
/**
 * The block across and up (m): past the course's boundaries a little, and tall enough to stand
 * well over a glider and the chase camera, but under the vista camera (cameraTuning.ts), which
 * looks down over it at the view rather than through it.
 */
const REACH = 4;
const HEIGHT = 16;
/**
 * The field loops are rectangles with rounded corners (the corner radius a share of the loop's
 * height): boxy loops fill the block's corners, so it reads as a block, and the round corners
 * keep them reading as field lines rather than girders.
 */
const LOOP_CORNER = 0.35;
/** The nested loops of one set, innermost to outermost, as shares of the block's half width and height. */
const LOOP_INNER = 0.22;
/**
 * Per graphics tier: metres between the sets of loops down the block, loops per set, metres
 * between motes along a line, sparks per glider, and the heights (m) of the low field lines
 * straight across the road (the loops are open underneath, and these fill the band the gliders
 * fly in, so a glider always has motes to part and light). Motes sit much closer along a line
 * than lines sit to each other, so each reads as a dotted field line. Low keeps the lines
 * readable at about a quarter of the motes.
 */
const DENSITY: Record<Quality, { set: number; loops: number; spacing: number; sparks: number; low: readonly number[] }> = {
  low: { set: 7, loops: 4, spacing: 1.6, sparks: 12, low: [1.2, 3.4] },
  high: { set: 4, loops: 5, spacing: 0.9, sparks: 28, low: [0.7, 2.1, 3.5] },
};
/** The low lines fade out over this far (m) short of the block's sides, where the loops rise. */
const LOW_SIDE_FADE = 4;
/** Each mote sits off its line by up to this much (m along the block, share of its loop's size): crisp lines, not a grid. */
const JITTER_ALONG = 0.25;
const JITTER_LOOP = 0.008;
/** Motes stream along their loops at this speed (m/s), pole to pole, fading in and out over this height (m) at either pole. */
const FLOW = 3.5;
const POLE_FADE = 1.5;
/** A pulse runs down the block's depth: its wavelength (m), speed (m/s) and depth (share of the light). */
const PULSE_WAVE = 22;
const PULSE_SPEED = 14;
const PULSE_DEPTH = 0.45;
/** A mote: its width and resting length (m), and its light (HDR, times the tint); the outermost loops, the block's shell, a little brighter. */
const MOTE_WIDTH = 0.09;
const MOTE_LENGTH = 0.3;
const MOTE_LIGHT = 0.55;
const SHELL_LIGHT = 1.6;
/** The block's ends fade over this far (m): the entry face softly, the far face into the road's end. */
const END_FADE = 10;
/**
 * Never drawn thinner than this many pixels: a thinner streak would shimmer as it crossed
 * pixel centres, so it is drawn at this width and dimmed to keep its light.
 */
const MIN_PIXELS = 1.4;
/** Motes this close to the camera (m) fade out, so a camera inside the block is never blinded. */
const NEAR_FADE: readonly [number, number] = [3, 12];
/** A glider's speed that counts as full force on the field (m/s): about a stock glider entering it. */
const SPEED_REF = 120;
/** The bubble a glider clears round itself (m), and how much further ahead its bow wave reaches per unit of speed (SPEED_REF). */
const BUBBLE = 5;
const BOW = 0.6;
/** How far the bubble pushes the motes out (share of BUBBLE): at rest, and more at full force. */
const PUSH_REST = 0.45;
const PUSH_SPEED = 0.6;
/** The shell of packed motes round a glider lights up (HDR, times the tint): at rest, at full force; and how far out it glows (m). */
const GLOW_REST = 1.2;
const GLOW_SPEED = 3.5;
const GLOW_REACH = 5.5;
/** At full force motes streak past a glider this much longer (m). */
const STREAK = 1.6;
/** Sparks: flashes per second each, length (m), the share of flashes that fire, light at rest and at full force, and how far off the hull they sit (share of its size). */
const SPARK_RATE = 9;
const SPARK_LENGTH = 1.1;
const SPARK_FIRE = 0.45;
const SPARK_REST = 0.6;
const SPARK_SPEED = 6;
const SPARK_SHELL = 1.15;
/** Streaks whiten toward their core as they gather energy: how much at full glow. */
const WHITE_HOT = 0.6;
/** The tint: the world's accent lifted toward white so even a dark accent reads as energy. */
const TINT_WHITE = 0.25;
const TINT_GAIN = 1.4;
/** Seeds the lattice's jitter and the sparks: every field looks the same, run to run. */
const FIELD_SEED = 0xf1e1d;

/** What each instance is: a mote on a loop, a mote on a low line across the road, or a spark on a glider's hull. */
const KIND_LOOP = 0;
const KIND_LOW = 1;
const KIND_SPARK = 2;

const f = (n: number) => n.toFixed(4);

const VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aMote;
attribute float aKind;
uniform float uTime;
uniform mat4 uField;
uniform vec3 uHalf;
uniform vec4 uRacer[${MAX_RACERS}];
uniform float uHalfHeight;
varying vec2 vCorner;
varying float vLight;
varying float vHot;

float hash(float n) { return fract(sin(n) * 43758.5453); }

// The field loop of size k (share of the block), walked by share u of its length from its right
// pole (on the ground) up, over the top and down to its left pole: its point, and its direction in t.
vec3 loop(float k, float u, out vec3 t) {
  float w = uHalf.x * k;
  float h = uHalf.y * k;
  float r = h * ${f(LOOP_CORNER)};
  float side = h - r;
  float top = 2.0 * (w - r);
  float arc = 1.5707963 * r;
  float d = u * (2.0 * side + top + 2.0 * arc);
  if (d < side) { t = vec3(0.0, 1.0, 0.0); return vec3(w, d, 0.0); }
  d -= side;
  if (d < arc) { float a = d / r; t = vec3(-sin(a), cos(a), 0.0); return vec3(w - r + r * cos(a), side + r * sin(a), 0.0); }
  d -= arc;
  if (d < top) { t = vec3(-1.0, 0.0, 0.0); return vec3(w - r - d, h, 0.0); }
  d -= top;
  if (d < arc) { float a = 1.5707963 + d / r; t = vec3(-sin(a), cos(a), 0.0); return vec3(-(w - r) + r * cos(a), side + r * sin(a), 0.0); }
  d -= arc;
  t = vec3(0.0, -1.0, 0.0);
  return vec3(-w, side - d, 0.0);
}

void main() {
  vec3 p;
  vec3 dir;
  float len;
  float light;
  float hot = 0.0;
  if (aKind != ${KIND_SPARK.toFixed(1)}) {
    float shape;
    if (aKind == ${KIND_LOOP.toFixed(1)}) {
      // aMote: loop size, depth into the block, phase round the loop, shell (1 on the outermost loop).
      float k = aMote.x;
      float perimeter = (2.0 * uHalf.y + 2.0 * uHalf.x) * k;
      p = loop(k, fract(aMote.z + uTime * ${f(FLOW)} / perimeter), dir);
      p.z = aMote.y;
      shape = mix(1.0, ${f(SHELL_LIGHT)}, aMote.w) * smoothstep(0.0, ${f(POLE_FADE)}, p.y);
    } else {
      // aMote: phase across, height, depth into the block. Flowing the way the loops' tops do.
      p = vec3(uHalf.x * (1.0 - 2.0 * fract(aMote.x + uTime * ${f(FLOW)} / (2.0 * uHalf.x))), aMote.y, aMote.z);
      dir = vec3(-1.0, 0.0, 0.0);
      shape = smoothstep(uHalf.x, uHalf.x - ${f(LOW_SIDE_FADE)}, abs(p.x));
    }
    len = ${f(MOTE_LENGTH)};
    float pulse = 1.0 - ${f(PULSE_DEPTH)} * (0.5 + 0.5 * sin(p.z * ${f((2 * Math.PI) / PULSE_WAVE)} - uTime * ${f((2 * Math.PI * PULSE_SPEED) / PULSE_WAVE)}));
    float ends = smoothstep(0.0, ${f(END_FADE)}, p.z) * smoothstep(uHalf.z * 2.0, uHalf.z * 2.0 - ${f(END_FADE)}, p.z);
    light = ${f(MOTE_LIGHT)} * shape * pulse * ends;
    // Each glider parts the lattice round itself and packs it into a glowing shell; at speed the
    // bow wave reaches further ahead and the motes streak past.
    vec3 push = vec3(0.0);
    float glow = 0.0;
    float stream = 0.0;
    for (int i = 0; i < ${MAX_RACERS}; i++) {
      vec4 r = uRacer[i];
      if (r.w < 0.0) continue;
      float force = min(r.w / ${f(SPEED_REF)}, 1.5);
      vec3 d = p - r.xyz;
      vec3 q = d;
      if (q.z > 0.0) q.z /= 1.0 + ${f(BOW)} * force;
      float d2 = dot(q, q);
      float near = exp(-d2 / ${f(BUBBLE * BUBBLE)});
      // Out sideways and up more than along: the motes flow round the nose, not ahead of it.
      vec3 away = vec3(d.x, d.y, d.z * 0.3);
      away = length(away) > 1e-3 ? normalize(away) : vec3(0.0, 1.0, 0.0);
      push += away * near * ${f(BUBBLE)} * (${f(PUSH_REST)} + ${f(PUSH_SPEED)} * force);
      glow += exp(-d2 / ${f(GLOW_REACH * GLOW_REACH)}) * (${f(GLOW_REST)} + ${f(GLOW_SPEED)} * force);
      stream += near * force;
    }
    p += push;
    stream = min(stream, 1.0);
    dir = normalize(mix(dir, vec3(0.0, 0.0, -1.0), stream));
    len += ${f(STREAK)} * stream;
    light += glow * (0.3 + light);
    hot = min(glow / ${f(GLOW_REST + GLOW_SPEED)}, 1.0);
  } else {
    // aMote: glider index, then three seeds. Each spark flashes somewhere new on the hull every cycle.
    vec4 r = uRacer[int(aMote.x)];
    float cycle = uTime * ${f(SPARK_RATE)} * (0.7 + 0.6 * aMote.y) + aMote.z * 13.0;
    float n = floor(cycle) + aMote.w * 97.0;
    float age = fract(cycle);
    vec3 off = normalize(vec3(hash(n) - 0.5, (hash(n + 1.3) - 0.3) * 0.7, hash(n + 2.7) - 0.5) + 1e-4);
    p = r.xyz + off * vec3(${f(RACER_HALF_WIDTH)}, ${f(RACER_HEIGHT / 2)}, ${f(RACER_LENGTH / 2)}) * ${f(SPARK_SHELL)};
    dir = normalize(vec3(hash(n + 4.1) - 0.5, hash(n + 5.9) - 0.5, hash(n + 7.7) - 0.5) + 1e-4);
    len = ${f(SPARK_LENGTH)} * (0.4 + hash(n + 9.3));
    float inside = r.w >= 0.0 && r.z > 0.0 && r.z < uHalf.z * 2.0 ? 1.0 : 0.0;
    float force = min(max(r.w, 0.0) / ${f(SPEED_REF)}, 1.5);
    light = inside * step(1.0 - ${f(SPARK_FIRE)}, hash(n + 11.1)) * (1.0 - age) * (${f(SPARK_REST)} + ${f(SPARK_SPEED)} * force);
    hot = 1.0;
  }
  vec4 world = uField * vec4(p, 1.0);
  vec4 view = viewMatrix * world;
  float depth = -view.z;
  if (light <= 0.0 || depth < 0.05) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vLight = 0.0;
    return;
  }
  vec3 vdir = mat3(viewMatrix) * (mat3(uField) * dir);
  vec3 side = cross(vdir, normalize(view.xyz));
  side = length(side) > 1e-4 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  float px = projectionMatrix[1][1] * uHalfHeight / depth;
  float width = max(${f(MOTE_WIDTH)}, ${f(MIN_PIXELS)} / px);
  light *= ${f(MOTE_WIDTH)} / width;
  light *= smoothstep(${f(NEAR_FADE[0])}, ${f(NEAR_FADE[1])}, length(view.xyz));
  view.xyz += vdir * max(len, width) * 0.5 * aCorner.x + side * width * aCorner.y;
  gl_Position = projectionMatrix * view;
  vCorner = aCorner;
  vLight = light;
  vHot = hot;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTint;
varying vec2 vCorner;
varying float vLight;
varying float vHot;
void main() {
  // A hard bright core along the streak, tapering to its tips.
  float across = 1.0 - smoothstep(0.0, 1.0, abs(vCorner.y));
  float along = 1.0 - vCorner.x * vCorner.x;
  float a = across * across * along;
  vec3 white = vec3(max(uTint.r, max(uTint.g, uTint.b)));
  vec3 col = mix(uTint, white, ${f(WHITE_HOT)} * vHot * across);
  gl_FragColor = vec4(col * vLight * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** What the field needs of a racer: where it is on which road, its height off it, its speed, and whether it is wrecked. */
export type FieldRacer = Pick<RacerState, 'branch' | 's' | 'x' | 'y' | 'speed' | 'crashed'>;

export interface ForceField {
  mesh: THREE.Mesh;
  /** The racers as the race has them now; `time` is race time. */
  press(racers: readonly FieldRacer[], time: number): void;
  dispose(): void;
}

/** The field at the end of an open (sprint) main road, or null for a circuit. */
export function buildForceField(ribbon: Ribbon, accent: THREE.Color, quality: Quality): ForceField | null {
  if (ribbon.closed) return null;
  const entry = ribbon.length - SPRINT_FIELD_DEPTH;
  // The run-out is straight (core/track.ts lays it so): the block is boxed in the frame at its entry.
  const fr = ribbon.frameAt(entry);
  const smp = ribbon.sampleAt(entry);
  const half = Math.max(smp.edgeL, smp.edgeR) + REACH;
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(fr.right.x, fr.right.y, fr.right.z),
    new THREE.Vector3(fr.up.x, fr.up.y, fr.up.z),
    new THREE.Vector3(fr.tangent.x, fr.tangent.y, fr.tangent.z),
  );
  basis.setPosition(fr.pos.x, fr.pos.y, fr.pos.z);

  const density = DENSITY[quality];
  const rand = mulberry32(FIELD_SEED);
  const motes: number[] = [];
  const kind: number[] = [];
  const sets = Math.floor(SPRINT_FIELD_DEPTH / density.set);
  for (let j = 0; j < sets; j++) {
    for (let l = 0; l < density.loops; l++) {
      const k = LOOP_INNER + ((1 - LOOP_INNER) * l) / (density.loops - 1);
      const n = Math.round(((2 * HEIGHT + 2 * half) * k) / density.spacing);
      for (let i = 0; i < n; i++) {
        const w = (j + 0.5) * density.set + (rand() * 2 - 1) * JITTER_ALONG;
        motes.push(k * (1 + (rand() * 2 - 1) * JITTER_LOOP), w, (i + rand() * 0.5) / n, l === density.loops - 1 ? 1 : 0);
        kind.push(KIND_LOOP);
      }
    }
    for (const y of density.low) {
      const n = Math.round((2 * half) / density.spacing);
      for (let i = 0; i < n; i++) {
        motes.push((i + rand() * 0.5) / n, y, (j + 0.5) * density.set + (rand() * 2 - 1) * JITTER_ALONG, 0);
        kind.push(KIND_LOW);
      }
    }
  }
  for (let r = 0; r < MAX_RACERS; r++) {
    for (let i = 0; i < density.sparks; i++) {
      motes.push(r, rand(), rand(), rand());
      kind.push(KIND_SPARK);
    }
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  // three needs a position to count the vertices; the shader places them from aCorner.
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aMote', new THREE.InstancedBufferAttribute(new Float32Array(motes), 4));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(kind), 1));
  geo.instanceCount = kind.length;
  // Bounds in world space (the mesh itself sits at the origin): the block, and a glider's sparks and pushed motes past its sides.
  const centre = new THREE.Vector3(0, HEIGHT / 2, SPRINT_FIELD_DEPTH / 2).applyMatrix4(basis);
  geo.boundingSphere = new THREE.Sphere(centre, Math.hypot(half, HEIGHT / 2, SPRINT_FIELD_DEPTH / 2) + BUBBLE);

  const racer = Array.from({ length: MAX_RACERS }, () => new THREE.Vector4(0, 0, 0, -1));
  const tint = accent.clone().lerp(new THREE.Color(1, 1, 1), TINT_WHITE).multiplyScalar(TINT_GAIN);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uField: { value: basis },
      uHalf: { value: new THREE.Vector3(half, HEIGHT, SPRINT_FIELD_DEPTH / 2) },
      uTint: { value: tint },
      uRacer: { value: racer },
      uHalfHeight: { value: 1 },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'forceField';
  mesh.matrixAutoUpdate = false;
  const size = new THREE.Vector2();
  // Streak widths are world metres turned into drawing-buffer pixels: the buffer's height.
  mesh.onBeforeRender = (renderer) => {
    material.uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(size).y / 2;
  };
  return {
    mesh,
    press(racers, time) {
      if (racers.length > MAX_RACERS) throw new Error(`forceField: ${racers.length} racers, the shader takes ${MAX_RACERS}`);
      material.uniforms.uTime.value = time;
      for (let i = 0; i < MAX_RACERS; i++) {
        const r = racers[i];
        // On the main road, in one piece: its place in the block (across, its middle's height, depth) and speed.
        if (r && r.branch < 0 && r.crashed <= 0) racer[i].set(r.x, r.y + RACER_HEIGHT / 2, r.s - entry, r.speed);
        else racer[i].set(0, 0, 0, -1);
      }
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
