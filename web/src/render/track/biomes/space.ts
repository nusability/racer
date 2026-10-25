import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.ts';
import type { TrackPalette } from '../../../core/types.ts';
import type { SpaceScenery } from '../../../data/tracks/scenery.ts';
import { FlatBuilder } from '../builder.ts';
import { sunDirection } from '../environment.ts';
import { concreteTexture, pavingTexture } from '../textures.ts';
import { facadeBox, facadeMaterial } from '../../facade.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { farRockMesh, fieldRocks, nearRockMesh, type Placed } from './spaceRocks.ts';
import { gantries, hullModules, megastructure, ribs, type Box, type Lights, type StationParts } from './spaceStation.ts';

// The ring station (look-dev, MIRA-17): no ground, every road a steel deck hanging in the void
// over a gas giant (render/track/spaceSky.ts draws it, the stars and the light). The kit dresses
// the course with the station (megastructures, the tube's hull and ribs, gantries over the
// deck), asteroid fields and a belt of far rocks, and the lights on all of it. The whole kit is
// about nine draw calls whatever the course length: a merged mesh or one instanced draw per kind.

/** The void's floor for the ground maths (Ground still answers heights): far under every road, never drawn. */
const VOID_BELOW = 600;
const VOID = new THREE.Color(0x000000);
/**
 * The deck is lit by its own lamps as well as the star: it keeps its markings readable on the
 * far side of a bend from the star and down the tube.
 */
const ROAD_LIGHT = 0.24;
/** The station's window and crown colours: cool white, the accent cyan, amber (sRGB). */
const STATION_NEON: readonly [number, number, number] = [0xd8ecff, 0x38d8ff, 0xffb05a];
/** What a craft kicks up off the deck, and what hazards would throw: steel and grit. */
const SPRAY_STEEL = 0x8a909a;
const STEEL = 0x8c939c;
const DUST = 0x6a6e76;
const SPARK = 0xffe2a8;
/** Lights: a light's core and halo (share of the point), and the share of a blink period it is lit. */
const LIGHT_CORE = 0.18;
const BLINK_ON = 0.15;
/** Lights never shrink under this many pixels, so a far one stays a crisp dot rather than flickering out. */
const LIGHT_MIN_PX = 1.6;
/** Asteroid fields hand the far belt a centre every this many metres. */
const FIELD_CENTRE_EVERY = 200;

export function spaceKit(scenery: SpaceScenery, palette: TrackPalette): BiomeKit {
  return {
    terrain: false,
    ground: {
      base: (minRoadY) => minRoadY - VOID_BELOW,
      natural: (g) => g.base,
      color: (_g, _x, _z, _y, _slope, out) => out.copy(VOID),
    },
    road: { surface: 'deck', runoff: 'concrete' },
    roadLight: ROAD_LIGHT,
    masonry: 'concrete',
    detail: (seed, quality) => ({ sand: pavingTexture(seed, quality), rock: concreteTexture(seed, quality) }),
    dress: (ctx) => dressSpace(ctx, scenery, palette),
    spray: { road: palette.road, runoff: SPRAY_STEEL, water: SPRAY_STEEL },
    debris: { color: STEEL, glow: 0, dust: DUST, streak: SPARK, shape: 'girder' },
  };
}

const LIGHT_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute vec2 aBlink;
uniform float uTime;
uniform float uHalfHeight;
uniform float uPx;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = aBlink.x > 0.0 ? step(1.0 - ${BLINK_ON.toFixed(2)}, fract(uTime / aBlink.x + aBlink.y)) : 1.0;
  vColor = aColor;
  // World size to pixels, never under a crisp minimum.
  gl_PointSize = on * max(${LIGHT_MIN_PX.toFixed(1)} * uPx, aSize * projectionMatrix[1][1] * uHalfHeight / -mv.z);
}`;

const LIGHT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(${LIGHT_CORE.toFixed(2)}, ${(LIGHT_CORE * 2).toFixed(2)}, r)) + 0.35 * (1.0 - smoothstep(0.0, 1.0, r));
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function lightPoints(l: Lights): { points: THREE.Points; material: THREE.ShaderMaterial; dispose(): void } | null {
  if (l.size.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(l.pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(l.colour, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(l.size, 1));
  geo.setAttribute('aBlink', new THREE.Float32BufferAttribute(l.blink, 2));
  geo.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: LIGHT_VERTEX,
    fragmentShader: LIGHT_FRAGMENT,
    uniforms: { uTime: { value: 0 }, uHalfHeight: { value: 1 }, uPx: { value: 1 } },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'stationLights';
  const size = new THREE.Vector2();
  // Sizes are world metres turned into drawing-buffer pixels: the buffer's height and pixel ratio.
  points.onBeforeRender = (renderer) => {
    material.uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(size).y / 2;
    material.uniforms.uPx.value = renderer.getPixelRatio();
  };
  return { points, material, dispose: () => (geo.dispose(), material.dispose()) };
}

function boxes(list: Box[], material: THREE.Material, name: string): { mesh: THREE.InstancedMesh; geo: THREE.BufferGeometry } | null {
  if (list.length === 0) return null;
  const geo = facadeBox();
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((b, i) => {
    mesh.setMatrixAt(i, b.m);
    mesh.setColorAt(i, b.tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return { mesh, geo };
}

function dressSpace(ctx: DressContext, scenery: SpaceScenery, palette: TrackPalette): Dressing {
  const rng = mulberry32(ctx.seed ^ 0x5bace);
  const main = ctx.corridors[0];
  const parts: StationParts = { windowed: [], bare: [], lights: { pos: [], colour: [], size: [], blink: [] }, lit: new FlatBuilder(), glow: new FlatBuilder() };
  for (const p of scenery.stations) megastructure(main, p, rng, parts);
  for (const c of ctx.corridors) {
    hullModules(c, rng, parts);
    ribs(c, parts);
  }
  for (const g of scenery.gates) gantries(main, main.ribbon.paramToS(g.from), main.ribbon.paramToS(g.to), parts);

  const rocks: Placed[] = [];
  const centres: { x: number; y: number; z: number }[] = [];
  for (const f of scenery.asteroidFields) {
    const s0 = main.ribbon.paramToS(f.from);
    const s1 = main.ribbon.paramToS(f.to);
    fieldRocks(main, s0, s1, scenery.rocksPerKm, ctx.quality, rng, rocks);
    for (let s = s0; s <= s1; s += FIELD_CENTRE_EVERY) centres.push(main.ribbon.sampleAt(s).pos);
  }

  const objects: THREE.Object3D[] = [];
  const owned: { dispose(): void }[] = [];
  const windowMat = facadeMaterial({ palette, neon: STATION_NEON, baseShade: null });
  const bareMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  owned.push(windowMat, bareMat, glowMat);
  for (const [list, mat, name] of [[parts.windowed, windowMat, 'stationHull'], [parts.bare, bareMat, 'stationFrame']] as const) {
    const b = boxes(list, mat, name);
    if (!b) continue;
    owned.push(b.geo);
    objects.push(b.mesh);
  }
  const lit = parts.lit.build();
  if (lit) {
    const m = new THREE.Mesh(lit, ctx.lit);
    m.name = 'stationSteel';
    owned.push(lit);
    objects.push(m);
  }
  const glow = parts.glow.build();
  if (glow) {
    const m = new THREE.Mesh(glow, glowMat);
    m.name = 'stationGlow';
    owned.push(glow);
    objects.push(m);
  }
  const near = nearRockMesh(rocks, ctx.quality, ctx.seed);
  if (near) {
    owned.push(near);
    objects.push(near.mesh);
  }
  const far = farRockMesh(ctx.ground, centres, scenery.farRocks, ctx.quality, sunDirection(palette), new THREE.Color(palette.sun), ctx.seed);
  if (far) {
    owned.push(far);
    objects.push(far.mesh);
  }
  const lights = lightPoints(parts.lights);
  if (lights) {
    owned.push(lights);
    objects.push(lights.points);
  }
  return {
    objects,
    update(time) {
      if (lights) lights.material.uniforms.uTime.value = time;
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}
