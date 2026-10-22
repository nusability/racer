// The oasis town: a frontier settlement round a shimmering spring. Domed adobe houses and
// wind-catcher towers ring the water, palms lean over it, a condenser spire marks the town
// from far off, awnings shade a little market, laundry flaps between roofs, irrigated plots
// make green strips in the sand and hover-taxis buzz round the rooftops.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { Frame, ball, beam, box, dome, mix, pick, prism, quad, shade, vary } from './shapes.ts';
import { palm, quadPts, rope, stripedAwning } from './props.ts';

const SALT = 0x0a515;
const RADIUS = 150;
const POOL = { x: 0, z: 12, rx: 42, rz: 28 } as const;
const HOUSES = { high: 64, low: 36 } as const;
/** Houses sit in a ring from the pool's edge out to this radius. */
const TOWN_OUTER = 125;
const WIND_TOWERS = 7;
const SPIRE = { x: 30, z: 62, height: 58 } as const;
const PALMS = { high: 18, low: 10 } as const;
const LAUNDRY_LINES = { high: 12, low: 6 } as const;
const TAXIS = { high: 5, low: 3 } as const;
const CROWD = { high: 260, low: 120 } as const;
const MARKET_STALLS = 8;
const FIELDS = 6;

const WATER_VERTEX = /* glsl */ `
varying vec2 vP;
#include <fog_pars_vertex>
void main() {
  vP = position.xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Deep centre to shallow rim, with sun glints that crawl over interfering ripples.
const WATER_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uGlint;
varying vec2 vP;
#include <fog_pars_fragment>
void main() {
  float r = length(vP);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.55, 1.0, r));
  vec2 p = vP * 32.0;
  float w = sin(p.x * 1.3 + uTime * 1.4) * sin(p.y * 1.1 - uTime * 1.1) + 0.6 * sin((p.x + p.y) * 0.8 + uTime * 0.8);
  col += uGlint * smoothstep(1.15, 1.5, w);
  col = mix(col, uShallow * 1.2, smoothstep(0.93, 1.0, r));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function water(kit: Kit): void {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDeep: { value: mix(0x0a4a6a, kit.palette.sky, 0.3) },
      uShallow: { value: mix(0x2ab8b0, kit.palette.accent, 0.25) },
      uGlint: { value: mix(kit.palette.sun, 0xffffff, 0.5) },
    },
  ]);
  uniforms.uTime = kit.u.uTime;
  const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT, uniforms, fog: true });
  const geo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(POOL.rx, 1, POOL.rz);
  mesh.position.set(POOL.x, 0.25, POOL.z);
  mesh.name = 'water';
  kit.addObject(mesh, geo, mat);
  // Stone lip and a paved promenade round it.
  kit.solid.add(prism(1, 1, 0.5, 28, true).scale(POOL.rx + 0.8, 1, POOL.rz + 0.8), 0xcab89a, new THREE.Matrix4().makeTranslation(POOL.x, 0, POOL.z));
  kit.solid.add(prism(1, 1, 0.2, 28).scale(POOL.rx + 12, 1, POOL.rz + 12), mix(kit.palette.sand, 0xe8dcc4, 0.5), new THREE.Matrix4().makeTranslation(POOL.x, 0, POOL.z));
}

function house(kit: Kit, x: number, z: number, adobe: THREE.Color): V3 {
  const { rng } = kit;
  const w = 7 + rng() * 7;
  const d = 7 + rng() * 6;
  const h = 4.5 + rng() * 4;
  const f = new Frame(x, 0, z, Math.atan2(x - POOL.x, z - POOL.z) + Math.PI);
  const wall = vary(rng, adobe, 0.08);
  const s = kit.solid;
  s.add(box(w, h, d), wall, f.m());
  s.add(box(w + 0.6, 0.6, d + 0.6), shade(wall, 1.08), f.m(0, h, 0));
  let top = h + 0.6;
  // Some houses carry a second storey, most a dome.
  if (rng() < 0.35) {
    s.add(box(w * 0.55, h * 0.7, d * 0.6), shade(wall, 0.96), f.m(-w * 0.15, top, d * 0.1));
    top += h * 0.7;
  }
  if (rng() < 0.7) s.add(dome(Math.min(w, d) * 0.32, 8, 3, 1.1), rng() < 0.3 ? mix(kit.palette.accent, 0xffffff, 0.35) : shade(wall, 1.12), f.m(w * 0.12, top, 0));
  s.add(quad(1.6, 2.6), 0x3a2418, f.m(0, 1.3, -d / 2 - 0.05, Math.PI));
  // A cloth canopy over the door and some rooftop clutter give each house its owner.
  s.add(quadPts([-1.4, 3, 0], [1.4, 3, 0], [1.4, 2.4, -1.4], [-1.4, 2.4, -1.4]), kit.festiveColor(), f.base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -d / 2)));
  const clutter = rng();
  if (clutter < 0.3) s.add(prism(0.9, 0.9, 1.6, 6), 0x6a7a80, f.m(-w * 0.32, h + 0.6, -d * 0.25));
  else if (clutter < 0.5) s.add(dome(1.3, 6, 2).rotateX(-0.9), 0xe8e8e8, f.m(w * 0.3, h + 1.6, -d * 0.3));
  else if (clutter < 0.7) for (const px of [-1, 0.4]) s.add(ball(0.7, 5, 3), 0x4a8a3a, f.m(px, h + 1.2, -d * 0.35));
  for (const wx of [-w * 0.3, w * 0.3]) {
    kit.lights.add(quad(1, 1.2), pick(rng, [0xffc070, 0xffa850, 0xffe0a0]), f.m(wx, h * 0.62, -d / 2 - 0.06, Math.PI), undefined, { depth: 0.2, freq: 0.7 + rng(), phase: rng() * 6 });
  }
  return f.p(w * 0.5, h + 0.6, -d * 0.5);
}

function windTower(kit: Kit, x: number, z: number, adobe: THREE.Color): void {
  const h = 18 + kit.rng() * 12;
  const s = kit.solid;
  s.add(box(4.5, h, 4.5), shade(adobe, 1.04), new THREE.Matrix4().makeTranslation(x, 0, z));
  s.add(box(5.4, 4, 5.4), shade(adobe, 1.1), new THREE.Matrix4().makeTranslation(x, h, z));
  for (const r of [0, Math.PI / 2]) s.add(box(5.6, 2.6, 0.9), 0x2a1a14, new THREE.Matrix4().makeRotationY(r).setPosition(x, h + 0.7, z));
  s.add(box(6, 0.6, 6), shade(adobe, 0.9), new THREE.Matrix4().makeTranslation(x, h + 4, z));
}

function spire(kit: Kit): void {
  const { x, z, height } = SPIRE;
  const s = kit.solid;
  const col = mix(0xe8dcc4, kit.palette.accent, 0.2);
  s.add(prism(7, 4, height * 0.75, 8), col, new THREE.Matrix4().makeTranslation(x, 0, z));
  s.add(ball(9, 12, 7), mix(kit.palette.accent, 0x2a8a9a, 0.4), new THREE.Matrix4().makeTranslation(x, height * 0.75 + 6, z));
  s.add(prism(1.5, 0.3, 12, 6), 0xd8b040, new THREE.Matrix4().makeTranslation(x, height * 0.75 + 14, z));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    kit.lamp(new THREE.OctahedronGeometry(0.6), [x + Math.cos(a) * 9.4, height * 0.75 + 6, z + Math.sin(a) * 9.4], kit.palette.accent, 3, undefined, { depth: 0.8, freq: 2, phase: i * 0.8, sharp: 2 });
  }
  kit.lamp(new THREE.OctahedronGeometry(1.2), [x, height * 0.75 + 27, z], 0xffd27a, 9, undefined, { depth: 0.5, freq: 1.5, phase: 0 });
  // Pipes running from the spire's tank down to the pool.
  for (const dx of [-3, 3]) kit.solid.add(beam([x + dx, 2, z - 6], [POOL.x + dx * 3, 0.6, POOL.z + POOL.rz - 2], 0.6, 5), 0x6a7a80);
}

/** A hover-taxi orbiting the town: body, canopy and glowing thrusters, bobbing as it goes. */
function taxi(kit: Kit, i: number): void {
  const { rng } = kit;
  const r = 70 + i * 16 + rng() * 10;
  const y = 22 + rng() * 22;
  const spin = (i % 2 ? -1 : 1) * (0.22 + rng() * 0.1);
  const start = rng() * Math.PI * 2;
  const motion: Motion = { hub: [POOL.x, y, POOL.z], axisA: [0, 1, 0], spinA: spin, drift: [0, 1.6, 0], driftFreq: 1.3 + rng() * 0.6, phase: rng() * 6 };
  // Built at rest at `start` round the hub, nose along the direction of travel.
  const f = new Frame(POOL.x + Math.cos(start) * r, y, POOL.z - Math.sin(start) * r, start + (spin > 0 ? 0 : Math.PI));
  const body = pick(rng, [0xf4d03f, 0xe8443a, 0xf2a33a]);
  kit.moving.add(ball(1, 8, 4), body, f.m(0, 0, 0, 0, 0, 0, [2.6, 1.5, 5.2]), motion);
  kit.moving.add(box(7.5, 0.4, 1.8), shade(body, 0.6), f.m(0, -0.3, 2.2), motion);
  for (let k = 0; k < 3; k++) kit.moving.add(box(0.7, 0.45, 0.7), 0x1a1a1a, f.m(-1.4 + k * 1.4, 1.2, 0.8), motion);
  kit.lights.add(ball(1, 6, 3), 0x7ad8ff, f.m(0, 0.8, -1.3, 0, 0, 0, [1.7, 1, 2.2]), motion, { depth: 0.1, freq: 1, phase: 0 });
  for (const sx of [-2, 2]) {
    const at = f.p(sx, -0.7, 4.1);
    kit.lights.add(new THREE.OctahedronGeometry(0.75), 0xff8a3a, new THREE.Matrix4().makeTranslation(...at), motion, { depth: 0.5, freq: 14, phase: sx });
    kit.halos.point(at, 0xff8a3a, 5, motion, { depth: 0.5, freq: 14, phase: sx });
  }
}

export function createOasisTown(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const adobe = mix(kit.palette.sand, 0xe8c8a0, 0.5);
  water(kit);

  // Irrigated plots behind the town: rows of green on dark earth.
  for (let i = 0; i < FIELDS; i++) {
    const a = Math.PI * 0.15 + (i / FIELDS) * Math.PI * 0.7;
    const f = new Frame(Math.cos(a) * 128, 0, POOL.z + Math.sin(a) * 105, -a);
    kit.solid.add(box(26, 0.3, 18), 0x6a4a30, f.m());
    for (let row = 0; row < 5; row++) kit.solid.add(box(24, 0.9, 1.6), vary(rng, 0x5aa040, 0.15), f.m(0, 0.3, -7 + row * 3.5));
  }

  // Houses in a loose ring round the water; rooftops collect laundry anchors.
  const roofs: V3[] = [];
  const n = kit.q(HOUSES.high, HOUSES.low);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.12;
    const t = rng();
    const rx = POOL.rx + 22 + t * (TOWN_OUTER - POOL.rx - 22);
    const rz = POOL.rz + 22 + t * (TOWN_OUTER * 0.8 - POOL.rz - 22);
    const x = POOL.x + Math.cos(a) * rx;
    const z = POOL.z + Math.sin(a) * rz;
    if (Math.hypot(x - SPIRE.x, z - SPIRE.z) < 16) continue;
    roofs.push(house(kit, x, z, adobe));
  }
  for (let i = 0; i < WIND_TOWERS; i++) {
    const a = (i / WIND_TOWERS) * Math.PI * 2 + 0.3;
    windTower(kit, POOL.x + Math.cos(a) * (POOL.rx + 34), POOL.z + Math.sin(a) * (POOL.rz + 30), adobe);
  }
  spire(kit);

  for (let i = 0; i < kit.q(PALMS.high, PALMS.low); i++) {
    const a = (i / kit.q(PALMS.high, PALMS.low)) * Math.PI * 2 + rng() * 0.2;
    palm(kit, POOL.x + Math.cos(a) * (POOL.rx + 5 + rng() * 6), POOL.z + Math.sin(a) * (POOL.rz + 5 + rng() * 5), 12 + rng() * 8, rng);
  }

  // A row of market awnings on the promenade facing the track.
  for (let i = 0; i < MARKET_STALLS; i++) {
    const x = POOL.x - 35 + i * 10;
    const f = new Frame(x, 0, POOL.z - POOL.rz - 8, 0);
    const col = kit.festiveColor();
    for (const dx of [-4, 4]) kit.solid.add(beam(f.p(dx, 0, -2.5), f.p(dx, 3, -2.5), 0.1, 3), 0x5a3a24);
    kit.solid.add(box(7, 1, 1), 0x8a6a48, f.m(0, 0, -2));
    kit.solid.add(ball(0.5, 5, 3), kit.festiveColor(), f.m(-1.5, 1.4, -2));
    kit.solid.add(ball(0.5, 5, 3), kit.festiveColor(), f.m(1.5, 1.4, -2));
    stripedAwning(kit.moving, f, 8.5, [3.6, 2], [2.9, -3.3], 6, col, 0xf3e6c8, { amp: 0.04, freq: 3, phase: i });
    kit.lamp(new THREE.OctahedronGeometry(0.3), f.p(3.6, 2.4, -3.2), 0xffc070, 2.2, undefined, { depth: 0.25, freq: 3, phase: i });
  }

  // Laundry strung between neighbouring rooftops, flapping.
  for (let i = 0; i < kit.q(LAUNDRY_LINES.high, LAUNDRY_LINES.low) && i + 1 < roofs.length; i++) {
    const a = roofs[(i * 5) % roofs.length];
    const b = roofs[(i * 5 + 1) % roofs.length];
    if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 30) continue;
    const pts = rope(kit, a, b, 1.2);
    const dir = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k];
      const g = quadPts([p[0] - dir.x * 0.7, p[1], p[2] - dir.z * 0.7], [p[0] + dir.x * 0.7, p[1], p[2] + dir.z * 0.7], [p[0] + dir.x * 0.7, p[1] - 1.8, p[2] + dir.z * 0.7], [p[0] - dir.x * 0.7, p[1] - 1.8, p[2] - dir.z * 0.7]);
      kit.moving.add(g, kit.festiveColor(), undefined, { pivot: p, axisB: [dir.x, 0, dir.z], swingB: 0.4, freq: 2.6, phase: k + i });
    }
  }

  for (let i = 0; i < kit.q(TAXIS.high, TAXIS.low); i++) taxi(kit, i);

  // Townsfolk stroll the promenade; a few sit by the water.
  for (let i = 0; i < kit.q(CROWD.high, CROWD.low); i++) {
    const a = rng() * Math.PI * 2;
    const ring = 3 + rng() * 9;
    const x = POOL.x + Math.cos(a) * (POOL.rx + ring);
    const z = POOL.z + Math.sin(a) * (POOL.rz + ring);
    const walking = rng() < 0.7;
    kit.crowd({ x, y: 0, z, ry: walking ? -a : -a - Math.PI / 2, color: vary(rng, pick(rng, [0xf3e6c8, 0xe8dcc4, 0x3a6ab0, 0xc84a3a, 0x3fb07f, kit.palette.accent]), 0.15), hop: walking ? 0.1 : 0.03, freq: walking ? 7 : 1.2, phase: rng() * 100, walk: walking ? 2 + rng() * 5 : 0, walkFreq: 0.15 + rng() * 0.1, scale: 0.95 + rng() * 0.15 });
  }
  return kit.finish(RADIUS);
}
