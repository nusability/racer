import * as THREE from 'three';
import type { Track } from '../core/track.ts';
import { sceneryById } from '../data/tracks/index.ts';
import { FlatBuilder, SmoothBuilder } from './track/builder.ts';
import { BOOST_SCROLL, CULL_MARGIN, FOG_FAR, type Quality } from './track/config.ts';
import { Corridor } from './track/corridor.ts';
import { buildDressing } from './track/dressing.ts';
import { buildRockFeatures } from './track/features.ts';
import { Ground } from './track/ground.ts';
import { buildHazards } from './track/hazards.ts';
import { buildHorizon } from './track/horizon.ts';
import { buildInstanced } from './track/instanced.ts';
import { makePaint } from './track/paint.ts';
import { corridorShape } from './track/shape.ts';
import { buildTerrain } from './track/terrain.ts';
import { boostTexture, roadTexture } from './track/textures.ts';

export { applyEnvironment } from './track/environment.ts';

export interface TrackScene {
  group: THREE.Group;
  update(time: number, cameraPos: THREE.Vector3): void;
  dispose(): void;
}

/** Boost pads float this far above the road (plus polygon offset). */
const PAD_LIFT = 0.05;
/** Chevron repeats along one pad. */
const PAD_REPEATS = 3;

export function buildTrackScene(track: Track, quality: Quality): TrackScene {
  const def = track.def;
  const scenery = sceneryById(def.id);
  const paint = makePaint(def.palette);
  const shape = corridorShape(track);
  const ground = new Ground(track, shape, scenery, def.palette);
  const glow = new FlatBuilder();
  const cor = new Corridor(track, shape, ground, paint, quality, glow);
  buildHazards(cor);
  buildRockFeatures(cor, def.seed);
  const props = new FlatBuilder();
  buildDressing(cor, props, def.seed);

  const group = new THREE.Group();
  group.name = `track:${def.id}`;
  const roadTex = roadTexture(def.palette, def.seed);
  const padTex = boostTexture();
  const mats = {
    road: new THREE.MeshLambertMaterial({ map: roadTex, vertexColors: true }),
    rock: new THREE.MeshLambertMaterial({ vertexColors: true }),
    ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    pad: new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
  };
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, static_ = true) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (static_) m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };

  // Culled parts: corridor chunks and near terrain tiles.
  const cullable: THREE.Object3D[] = [];
  for (const c of cor.chunks) {
    const r = add(c.road.build(true), mats.road, `road${c.k0}`);
    const e = add(c.env.build(), mats.rock, `env${c.k0}`);
    if (r) cullable.push(r);
    if (e) cullable.push(e);
  }
  for (const t of buildTerrain(ground, quality, mats.ground)) {
    group.add(t);
    if (t.geometry.boundingSphere && t.geometry.boundingSphere.radius < 2000) cullable.push(t);
  }
  add(buildHorizon(cor, scenery, quality, def.seed).build(), mats.rock, 'horizon');
  add(props.build(), mats.rock, 'props');
  for (const m of buildInstanced(cor, scenery, quality, mats.rock, def.seed)) group.add(m);
  add(boostPads(track), mats.pad, 'boostPads');
  add(glow.build(), mats.glow, 'glow');

  const fogFar = FOG_FAR[quality];
  return {
    group,
    update(time, cameraPos) {
      padTex.offset.y = -time * BOOST_SCROLL;
      for (const o of cullable) {
        const bs = (o as THREE.Mesh).geometry.boundingSphere;
        if (!bs) continue;
        o.visible = bs.center.distanceTo(cameraPos) - bs.radius < fogFar + CULL_MARGIN;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of Object.values(mats)) m.dispose();
      roadTex.dispose();
      padTex.dispose();
    },
  };
}

function boostPads(track: Track): THREE.BufferGeometry | null {
  const b = new SmoothBuilder();
  const white = new THREE.Color(1, 1, 1);
  const rows = 6;
  for (const p of track.boostPads) {
    const first = b.vertexCount;
    for (let i = 0; i <= rows; i++) {
      const s = p.s - p.length / 2 + (p.length * i) / rows;
      for (const [u, x] of [[0, p.x - p.width / 2], [1, p.x + p.width / 2]]) {
        b.vertex(track.toWorld(s, x, PAD_LIFT), white, u, (i / rows) * PAD_REPEATS);
      }
    }
    for (let i = 0; i < rows; i++) {
      const a = first + i * 2;
      b.tri(a, a + 1, a + 3);
      b.tri(a, a + 3, a + 2);
    }
  }
  return b.build(true);
}
