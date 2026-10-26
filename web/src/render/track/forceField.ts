import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import type { RacerState } from '../../core/types.ts';
import { RACER_HEIGHT, RACER_LENGTH, SPRINT_FIELD_BACK, SPRINT_FIELD_SINK } from '../../data/tuning.ts';

// The force field closing a sprint's run-out (the race holds finishers on it: core/race.ts):
// a see-through membrane of energy across the road, boundary to boundary. It shimmers with a
// hex weave and glows at grazing angles (fresnel), brightens where a racer closes on it, and
// gives like jelly where one presses in: a bulge round the craft's nose as deep as it sinks,
// and rings rippling out from where it touched. Racers reach it through uniforms, so it is
// one draw and the CPU only writes a few numbers a frame. Tinted by the world's accent.

/** Racers the shader takes (a race has six). */
const MAX_RACERS = 8;
/** The membrane: reach past the hard boundaries and height over the road (m); grid cells across and up. */
const REACH = 6;
const HEIGHT = 12;
const CELLS: readonly [number, number] = [56, 18];
/** A bulge's radius round the craft (m): about its size. */
const BULGE_RADIUS = 4.5;
/** A racer this close (m, nose to membrane) starts to light it up. */
const GLOW_REACH = 60;
/** A touch's ripple: ring spacing (m), speed (m/s), fade (s) and reach (m), and how far its rings stand out (m). */
const RIPPLE_WAVELENGTH = 3.5;
const RIPPLE_SPEED = 9;
const RIPPLE_FADE = 1.6;
const RIPPLE_REACH = 14;
const RIPPLE_AMPLITUDE = 0.5;
/** The weave: hex cell size (m), line width (share of a cell); a shimmer runs over it in bands (waves per metre across and up, rate 1/s) and dims it by up to SHIMMER_DEPTH. */
const HEX = 1.6;
const HEX_LINE = 0.08;
/** Lines fade to their average cover (about three line widths of a cell) as a cell shrinks under a few pixels (cells per pixel). */
const HEX_COVER = HEX_LINE * 3;
const HEX_FADE: readonly [number, number] = [0.1, 0.4];
const SHIMMER: readonly [number, number] = [0.9, 1.3];
const SHIMMER_RATE = 1.3;
const SHIMMER_DEPTH = 0.4;
/** Idle swell of the sheet (m), in two crossing waves (per metre across and up) at these rates (1/s): it is never quite still. */
const SWELL = 0.15;
const SWELL_WAVES: readonly [number, number] = [0.31, 0.47];
const SWELL_RATES: readonly [number, number] = [0.7, 0.56];
/** The sheet fades in over this height off the road (m), and out over its top share: a field, not a pane. */
const FOOT_FADE = 1.5;
const TOP_FADE = 0.45;
/** The rim's falloff from grazing (higher: a thinner rim). */
const RIM_POWER = 3;
/** Under a racer's glow the bare sheet lights to this share of its weave's. */
const GLOW_FILL = 0.4;
/** Light (HDR, times the tint): the sheet, its weave, its rim at grazing angles, and the glow of a racer close or pressing and of a ripple's crests (capped). */
const SHEET = 0.05;
const WEAVE = 0.25;
const RIM = 0.9;
const PRESS_GLOW = 1.6;
const ENERGY_CAP = 1.5;
/** The sheet fades out within this range of the camera (m), so a chase camera at rest just short of it is not blinded by it. */
const NEAR_FADE: readonly [number, number] = [5, 22];
/** The tint: the world's accent lifted toward white so even a dark accent reads as energy. */
const TINT_WHITE = 0.25;
const TINT_GAIN = 1.4;

const VERTEX = /* glsl */ `
attribute vec2 aSheet;
uniform float uTime;
uniform vec3 uFwd;
uniform vec4 uRacer[${MAX_RACERS}];
uniform vec4 uTouch[${MAX_RACERS}];
varying vec2 vSheet;
varying float vEnergy;
varying vec3 vWorld;
void main() {
  // Push along the road: the bulge round each pressing craft, the rings of each touch, the idle swell.
  float push = ${SWELL.toFixed(3)} * sin(aSheet.x * ${SWELL_WAVES[0].toFixed(3)} + uTime * ${SWELL_RATES[0].toFixed(3)}) * sin(aSheet.y * ${SWELL_WAVES[1].toFixed(3)} - uTime * ${SWELL_RATES[1].toFixed(3)});
  float energy = 0.0;
  for (int i = 0; i < ${MAX_RACERS}; i++) {
    vec4 r = uRacer[i];
    vec2 d = aSheet - r.xy;
    float near = exp(-dot(d, d) / ${(2 * BULGE_RADIUS * BULGE_RADIUS).toFixed(3)});
    push += r.z * near;
    energy += (r.z > 0.0 ? 1.0 : r.w) * near;
    vec4 t = uTouch[i];
    float age = uTime - t.z;
    if (t.w > 0.0 && age >= 0.0) {
      float dist = length(aSheet - t.xy);
      float front = dist - age * ${RIPPLE_SPEED.toFixed(3)};
      float ring = sin(front * ${(2 * Math.PI / RIPPLE_WAVELENGTH).toFixed(4)}) * step(front, 0.0);
      float fade = t.w * exp(-age / ${RIPPLE_FADE.toFixed(3)}) * exp(-dist / ${RIPPLE_REACH.toFixed(3)});
      push += ring * fade * ${RIPPLE_AMPLITUDE.toFixed(3)};
      energy += max(ring, 0.0) * fade;
    }
  }
  vec3 p = position + uFwd * push;
  vSheet = aSheet;
  vEnergy = energy;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uTint;
varying vec2 vSheet;
varying float vEnergy;
varying vec3 vWorld;
// Distance to the nearest edge of a hex cell (cells of unit size), 0 on the edge.
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  q = abs(q);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
void main() {
  // The bulged sheet's own normal, from screen derivatives: the rim follows the jelly's shape.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - abs(dot(n, v)), ${RIM_POWER.toFixed(1)});
  float edge = hexEdge(vSheet / ${HEX.toFixed(3)});
  float px = fwidth(vSheet.x) / ${HEX.toFixed(3)};
  // Lines fade to their average once a cell is under a few pixels, so the far sheet never moirés.
  float line = mix(1.0 - smoothstep(0.0, ${HEX_LINE.toFixed(3)} + px, edge), ${HEX_COVER.toFixed(3)}, smoothstep(${HEX_FADE[0].toFixed(3)}, ${HEX_FADE[1].toFixed(3)}, px));
  float shimmer = 1.0 - ${SHIMMER_DEPTH.toFixed(3)} * (0.5 + 0.5 * sin(vSheet.x * ${SHIMMER[0].toFixed(3)} - vSheet.y * ${SHIMMER[1].toFixed(3)} + uTime * ${SHIMMER_RATE.toFixed(3)}));
  float body = smoothstep(0.0, ${FOOT_FADE.toFixed(3)}, vSheet.y) * (1.0 - smoothstep(${(HEIGHT * (1 - TOP_FADE)).toFixed(3)}, ${HEIGHT.toFixed(3)}, vSheet.y));
  float near = smoothstep(${NEAR_FADE[0].toFixed(3)}, ${NEAR_FADE[1].toFixed(3)}, length(cameraPosition - vWorld));
  float light = ${SHEET.toFixed(3)} + ${WEAVE.toFixed(3)} * line * shimmer + ${RIM.toFixed(3)} * rim + ${PRESS_GLOW.toFixed(3)} * min(vEnergy, ${ENERGY_CAP.toFixed(3)}) * (${GLOW_FILL.toFixed(3)} + line);
  gl_FragColor = vec4(uTint * light * body * near, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** What the field needs of a racer: where it is on which road, its height off it, and whether it is wrecked. */
export type FieldRacer = Pick<RacerState, 'branch' | 's' | 'x' | 'y' | 'crashed'>;

export interface ForceField {
  mesh: THREE.Mesh;
  /** The racers as the race has them now; `time` is race time. */
  press(racers: readonly FieldRacer[], time: number): void;
  dispose(): void;
}

/** The membrane at the end of an open (sprint) main road, or null for a circuit. */
export function buildForceField(ribbon: Ribbon, accent: THREE.Color): ForceField | null {
  if (ribbon.closed) return null;
  const at = ribbon.length - SPRINT_FIELD_BACK;
  const smp = ribbon.sampleAt(at);
  const left = -smp.edgeL - REACH;
  const right = smp.edgeR + REACH;
  const pos: number[] = [];
  const sheet: number[] = [];
  const index: number[] = [];
  const [nu, nv] = CELLS;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const x = left + ((right - left) * i) / nu;
      const y = (HEIGHT * j) / nv;
      const p = ribbon.toWorld(at, x, y);
      pos.push(p.x, p.y, p.z);
      sheet.push(x, y);
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        index.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSheet', new THREE.Float32BufferAttribute(sheet, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const racer = Array.from({ length: MAX_RACERS }, () => new THREE.Vector4());
  const touch = Array.from({ length: MAX_RACERS }, () => new THREE.Vector4());
  const tint = accent.clone().lerp(new THREE.Color(1, 1, 1), TINT_WHITE).multiplyScalar(TINT_GAIN);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uFwd: { value: new THREE.Vector3(smp.tangent.x, smp.tangent.y, smp.tangent.z) },
      uTint: { value: tint },
      uRacer: { value: racer },
      uTouch: { value: touch },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'forceField';
  mesh.matrixAutoUpdate = false;
  // The bulge pushes the sheet past its flat bounds: the sphere grows by the deepest a nose sinks.
  if (geo.boundingSphere) geo.boundingSphere.radius += SPRINT_FIELD_SINK + RACER_LENGTH / 2 + RIPPLE_AMPLITUDE;
  const pressing = new Array<boolean>(MAX_RACERS).fill(false);
  return {
    mesh,
    press(racers, time) {
      if (racers.length > MAX_RACERS) throw new Error(`forceField: ${racers.length} racers, the shader takes ${MAX_RACERS}`);
      material.uniforms.uTime.value = time;
      for (let i = 0; i < MAX_RACERS; i++) {
        const r = racers[i];
        const height = r ? r.y + RACER_HEIGHT / 2 : 0;
        // How far its nose has sunk into the membrane, and how near it is when short of it.
        const nose = r && r.branch < 0 && r.crashed <= 0 ? r.s + RACER_LENGTH / 2 - at : -Infinity;
        const sink = Math.max(0, nose);
        const glow = Math.max(0, 1 + nose / GLOW_REACH);
        racer[i].set(r ? r.x : 0, height, sink, Math.min(1, glow));
        // The moment it touches, rings start from there.
        if (sink > 0 && !pressing[i] && r) touch[i].set(r.x, height, time, 1);
        pressing[i] = sink > 0;
      }
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
