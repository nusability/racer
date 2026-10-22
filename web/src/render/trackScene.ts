import * as THREE from 'three';
import type { Track } from '../core/track.ts';
import { sceneryById } from '../data/tracks/index.ts';
import { FlatBuilder, SmoothBuilder } from './track/builder.ts';
import { BOOST_SCROLL, CULL_MARGIN, FOG_FAR, ROCK_TILE, SAND_TILE, type Quality } from './track/config.ts';
import { Corridor, type Scatter } from './track/corridor.ts';
import { buildCells } from './track/cells.ts';
import { buildDressing } from './track/dressing.ts';
import { buildRockFeatures } from './track/features.ts';
import { Ground } from './track/ground.ts';
import { buildHazards } from './track/hazards.ts';
import { buildHorizon } from './track/horizon.ts';
import { buildInstanced } from './track/instanced.ts';
import { buildJunctions, type SignQuads } from './track/junction.ts';
import { checkLandmarkClearance, placeLandmarks, updateLandmarks } from './track/landmarks.ts';
import { makePaint } from './track/paint.ts';
import { buildPosts } from './track/posts.ts';
import { ribbonViews } from './track/shape.ts';
import { buildTerrain } from './track/terrain.ts';
import { boostTexture, roadTexture, rockTexture, sandTexture, signTexture } from './track/textures.ts';

export { applyEnvironment } from './track/environment.ts';

export interface TrackScene {
  group: THREE.Group;
  update(time: number, cameraPos: THREE.Vector3): void;
  /** The player flew through a boost cell: pop it and hide it (branch -1 = main loop). */
  collectCell(branch: number, cell: number): void;
  /** A new lap for the player: every cell shows again. */
  resetCells(): void;
  dispose(): void;
}

/** Boost pads float this far above the road (plus polygon offset). */
const PAD_LIFT = 0.05;
/** Chevron repeats along one pad. */
const PAD_REPEATS = 3;
/** Crowd stands on the outside of the tightest corners. */
const CORNER_STANDS = { low: 1, high: 3 } as const;

export function buildTrackScene(track: Track, quality: Quality): TrackScene {
  const def = track.def;
  const scenery = sceneryById(def.id);
  const paint = makePaint(def.palette);
  const views = ribbonViews(track);
  const ground = new Ground(views, scenery, def.palette, def.seed);
  // Landmarks first: they level the ground the corridor and terrain then read.
  const landmarks = placeLandmarks(track, scenery, ground, quality);
  const glow = new FlatBuilder();
  const scatter: Scatter = { pylons: [], lights: [] };
  const corridors = views.map((v, i) => new Corridor(v, i, ground, paint, scenery.boundary, quality, glow, scatter));
  for (const c of corridors) {
    buildHazards(c);
    buildRockFeatures(c, def.seed);
  }
  const props = new FlatBuilder();
  buildDressing(corridors[0], props, def.seed, CORNER_STANDS[quality]);
  const signs: SignQuads = { pos: [], uv: [] };
  buildJunctions(corridors[0], corridors.slice(1), track, signs);

  const group = new THREE.Group();
  group.name = `track:${def.id}`;
  const tex = {
    road: roadTexture(def.palette, def.seed, quality),
    sand: sandTexture(def.seed, quality),
    rock: rockTexture(def.seed, quality),
    pad: boostTexture(),
    sign: signTexture(track.branches.map((b) => ({ name: b.def.name, side: b.side })), def.palette.accent),
  };
  const mats = {
    road: new THREE.MeshLambertMaterial({ map: tex.road, vertexColors: true }),
    // Branch roads overlap the main road's edge in junctions; they win the depth tie.
    branchRoad: new THREE.MeshLambertMaterial({ map: tex.road, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    sand: new THREE.MeshLambertMaterial({ map: tex.sand, vertexColors: true }),
    rock: new THREE.MeshLambertMaterial({ map: tex.rock, vertexColors: true }),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    pad: new THREE.MeshBasicMaterial({ map: tex.pad, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    sign: new THREE.MeshBasicMaterial({ map: tex.sign, side: THREE.DoubleSide }),
  };
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };

  // Culled parts: corridor chunks and near terrain tiles.
  const cullable: THREE.Mesh[] = [];
  corridors.forEach((cor, ci) => {
    for (const c of cor.chunks) {
      for (const m of [
        add(c.road.build(true), ci === 0 ? mats.road : mats.branchRoad, `road${ci}:${c.k0}`),
        c.sand === c.rock ? null : add(c.sand.build(SAND_TILE), mats.sand, `sand${ci}:${c.k0}`),
        add(c.rock.build(ROCK_TILE), quality === 'low' ? mats.plain : mats.rock, `rock${ci}:${c.k0}`),
      ]) {
        if (m) cullable.push(m);
      }
    }
  });
  for (const t of buildTerrain(ground, quality, mats.sand)) {
    group.add(t);
    if (t.geometry.boundingSphere && t.geometry.boundingSphere.radius < 2000) cullable.push(t);
  }
  add(buildHorizon(corridors[0], scenery, quality, def.seed).build(ROCK_TILE), mats.rock, 'horizon');
  add(props.build(), mats.plain, 'props');
  for (const m of buildInstanced(corridors[0], scenery, quality, mats.plain, def.seed)) group.add(m);
  for (const m of buildPosts(scatter, paint, scenery.boundary, glow, mats.plain, mats.unlit)) group.add(m);
  add(boostPads(corridors.map((c) => c.ribbon)), mats.pad, 'boostPads');
  if (signs.pos.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(signs.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(signs.uv, 2));
    g.computeBoundingSphere();
    add(g, mats.sign, 'forkSigns');
  }
  add(glow.build(), mats.glow, 'glow');
  const cells = buildCells(corridors.map((c) => c.ribbon));
  for (const m of cells.meshes) group.add(m);
  for (const l of landmarks) group.add(l.landmark.group);
  checkLandmarkClearance(landmarks, ground);

  const fogFar = FOG_FAR[quality];
  let last: number | null = null;
  return {
    group,
    update(time, cameraPos) {
      const dt = last === null ? 0 : Math.max(0, Math.min(0.1, time - last));
      last = time;
      tex.pad.offset.y = -time * BOOST_SCROLL;
      cells.update(time);
      for (const o of cullable) {
        const bs = o.geometry.boundingSphere;
        if (bs) o.visible = bs.center.distanceTo(cameraPos) - bs.radius < fogFar + CULL_MARGIN;
      }
      updateLandmarks(landmarks, quality, time, dt, cameraPos);
    },
    collectCell(branch, cell) {
      cells.collect(branch, cell);
    },
    resetCells() {
      cells.reset();
    },
    dispose() {
      cells.dispose();
      for (const l of landmarks) l.landmark.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.name.startsWith('landmark')) o.geometry.dispose();
      });
      for (const m of Object.values(mats)) m.dispose();
      for (const t of Object.values(tex)) t.dispose();
    },
  };
}

function boostPads(ribbons: Track['branches'][number]['ribbon'][]): THREE.BufferGeometry | null {
  const b = new SmoothBuilder();
  const white = new THREE.Color(1, 1, 1);
  const rows = 6;
  for (const r of ribbons) {
    for (const p of r.boostPads) {
      const first = b.vertexCount;
      for (let i = 0; i <= rows; i++) {
        const s = p.s - p.length / 2 + (p.length * i) / rows;
        for (const [u, x] of [[0, p.x - p.width / 2], [1, p.x + p.width / 2]]) {
          b.vertex(r.toWorld(s, x, PAD_LIFT), white, u, (i / rows) * PAD_REPEATS);
        }
      }
      for (let i = 0; i < rows; i++) {
        const a = first + i * 2;
        b.tri(a, a + 1, a + 3);
        b.tri(a, a + 3, a + 2);
      }
    }
  }
  return b.build(true);
}
