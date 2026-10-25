import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.ts';
import type { TrackPalette } from '../../../core/types.ts';
import type { SpaceScenery } from '../../../data/tracks/scenery.ts';
import { sunDirection } from '../environment.ts';
import { hullPlateTexture } from '../deckTexture.ts';
import { pavingTexture, rockTexture, sandTexture } from '../textures.ts';
import { stationMaterial } from '../../stationMaterial.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { farRockMesh, fieldRocks, nearRocks, type Placed } from './spaceRocks.ts';
import { gantries } from './spaceGantry.ts';
import { megastructure, type Lights } from './spaceStation.ts';
import { StationMesh } from './stationMesh.ts';
import { tubeDressing } from './spaceTube.ts';
import { solarArrays } from './spaceArrays.ts';
import { boreGeometry } from './spaceBores.ts';
import { moonGround } from './spaceMoon.ts';

// Orbital Reach's ring station (MIRA-17): no ground, every road a steel deck hanging in the void
// over a gas giant (render/track/spaceSky.ts draws it, the stars and the light). The kit dresses
// the course with the station (megastructures, the tube's hull kit and ribs, gantries over the
// deck), asteroid fields and a belt of far rocks, and the lights on all of it. Station
// structure is merged per structure (a megastructure, a stretch of tube, a span of gantries)
// in one material, so each culls on its own and costs one draw; rocks and lights are one
// instanced draw per kind. Solar arrays (spaceArrays.ts) are one more structure, and a bore
// through a giant asteroid (spaceBores.ts) one more draw. One track has ground: a moon
// (spaceMoon.ts), with regolith where the decks have void.

/** The void's floor for the ground maths (Ground still answers heights): far under every road, never drawn. */
const VOID_BELOW = 600;
const VOID = new THREE.Color(0x000000);
/**
 * The deck is lit by its own lamps as well as the star: it keeps its markings readable on the
 * far side of a bend from the star and down the tube.
 */
const ROAD_LIGHT = 0.24;
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
/** Salt of the generator that varies the solar arrays, apart from the station's own. */
const ARRAY_SALT = 0x5a1a2;

export function spaceKit(scenery: SpaceScenery, palette: TrackPalette): BiomeKit {
  // A moon (the one space track with ground): regolith run-off, walls and bores of grey rock.
  const moon = scenery.moon;
  return {
    terrain: moon !== null,
    ground: moon
      ? moonGround(moon, palette)
      : {
          base: (minRoadY) => minRoadY - VOID_BELOW,
          natural: (g) => g.base,
          color: (_g, _x, _z, _y, _slope, out) => out.copy(VOID),
        },
    road: { surface: 'deck', runoff: moon ? 'sand' : 'concrete' },
    roadLight: ROAD_LIGHT,
    masonry: moon ? 'sandstone' : 'hull',
    detail: (seed, quality) => (moon ? { sand: sandTexture(seed, quality), rock: rockTexture(seed, quality) } : { sand: pavingTexture(seed, quality), rock: hullPlateTexture(seed, quality) }),
    dress: (ctx) => dressSpace(ctx, scenery, palette),
    spray: { road: palette.road, runoff: moon ? palette.sand : SPRAY_STEEL, water: SPRAY_STEEL },
    // Station hoists drop cargo and ore in pods (render/landmarks/f/cargoHoist.ts throws the same pod).
    debris: { color: STEEL, glow: 0, dust: moon ? palette.sand : DUST, streak: SPARK, shape: 'pod' },
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

function dressSpace(ctx: DressContext, scenery: SpaceScenery, palette: TrackPalette): Dressing {
  const rng = mulberry32(ctx.seed ^ 0x5bace);
  const main = ctx.corridors[0];
  const lights: Lights = { pos: [], colour: [], size: [], blink: [] };
  const structures: [string, StationMesh][] = [];
  for (const p of scenery.stations) structures.push(['megastructure', megastructure(main, p, rng, ctx.quality, lights)]);
  // On a moon a tube runs through the ground's own rock: there is no hull to dress.
  if (scenery.moon === null) for (const c of ctx.corridors) for (const t of tubeDressing(c, rng, ctx.quality, lights)) structures.push(['tubeHull', t]);
  const gates = gantries(main, scenery.gates.map((g) => [main.ribbon.paramToS(g.from), main.ribbon.paramToS(g.to)] as const), lights);
  if (gates) structures.push(['gantries', gates]);
  const arrayRng = mulberry32(ctx.seed ^ ARRAY_SALT);
  const arrays = new StationMesh();
  for (const a of scenery.arrays) solarArrays(main, main.ribbon.paramToS(a.from), main.ribbon.paramToS(a.to), a.side, sunDirection(palette), arrayRng, arrays, scenery.moon !== null);
  structures.push(['solarArrays', arrays]);

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
  const station = stationMaterial(palette.accent, sunDirection(palette), new THREE.Color(palette.sun), ctx.quality === 'low');
  owned.push(station.material);
  structures.forEach(([name, st], i) => {
    const geo = st.build();
    if (!geo) return;
    const m = new THREE.Mesh(geo, station.material);
    m.name = `${name}:${i}`;
    m.matrixAutoUpdate = false;
    owned.push(geo);
    objects.push(m);
  });
  scenery.bores.forEach((b, i) => {
    const geo = boreGeometry(main, main.ribbon.paramToS(b.from), main.ribbon.paramToS(b.to), ctx.seed + i);
    const m = new THREE.Mesh(geo, ctx.lit);
    m.name = `bore:${i}`;
    m.matrixAutoUpdate = false;
    owned.push(geo);
    objects.push(m);
  });
  const near = nearRocks(rocks, ctx.quality, ctx.seed);
  if (near) {
    owned.push(near);
    objects.push(...near.meshes);
  }
  const far = farRockMesh(ctx.ground, centres, scenery.farRocks, ctx.quality, sunDirection(palette), new THREE.Color(palette.sun), ctx.seed);
  if (far) {
    owned.push(far);
    objects.push(far.mesh);
  }
  const points = lightPoints(lights);
  if (points) {
    owned.push(points);
    objects.push(points.points);
  }
  return {
    objects,
    update(time, camera) {
      station.setTime(time);
      near?.update(camera);
      if (points) points.material.uniforms.uTime.value = time;
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}
