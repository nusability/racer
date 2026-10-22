// Shared building kit for the set-B landmarks. Every landmark is a handful of merged,
// vertex-coloured buckets (one draw call each) whose motion lives in the vertex shader (see
// motion.ts), so update() only advances one time uniform.

import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, type Rng } from '../../../core/rng.ts';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { beamMaterial, glowMaterial, solidMaterial, type Motion, type SharedUniforms, type Twinkle, type V3 } from './motion.ts';
import { Bucket } from './bucket.ts';
import { Particles, pointsMaterial, trackDrawingBuffer } from './points.ts';
import { buildCrowd, type CrowdSpot } from './crowd.ts';
import { FESTIVE, LAMPS, T, pick } from './shapes.ts';

/** Emissive brightness of lights at midday and at deep dusk (NoToneMapping clamps at 1). */
const GLOW_DAY = 0.82;
const GLOW_DUSK = 1;
/** Additive halo strength round lights: barely there in daylight, blooming at dusk. */
const HALO_DAY = 0.16;
const HALO_DUSK = 0.95;
/** Soft-sprite falloff exponent for halos (hot centre). */
const HALO_HARDNESS = 2.2;

/** One landmark under construction: its rng, palette-derived colours and draw buckets. */
export class Kit {
  readonly rng: Rng;
  readonly palette: TrackPalette;
  readonly high: boolean;
  readonly dusk: number;
  readonly u: SharedUniforms;
  readonly group = new THREE.Group();
  readonly solid = new Bucket({});
  readonly moving = new Bucket({ kinetic: true });
  readonly lights = new Bucket({ kinetic: true, twinkle: true });
  readonly beams = new Bucket({ kinetic: true, twinkle: true });
  readonly halos = new Bucket({ kinetic: true, twinkle: true, sized: true });
  readonly festive: THREE.Color[];
  readonly lamps: THREE.Color[];
  private readonly crowdSpots: CrowdSpot[] = [];
  private readonly particleSets: Particles[] = [];
  private readonly owned: { dispose(): void }[] = [];

  constructor(opts: LandmarkOptions, salt: number) {
    this.rng = mulberry32((opts.seed ^ salt) >>> 0);
    this.palette = opts.palette;
    this.high = opts.quality === 'high';
    this.dusk = opts.palette.dusk;
    this.u = { uTime: { value: 0 }, uGlow: { value: GLOW_DAY + (GLOW_DUSK - GLOW_DAY) * this.dusk } };
    this.festive = [...FESTIVE, opts.palette.accent].map((c) => new THREE.Color(c));
    this.lamps = [...LAMPS, opts.palette.accent].map((c) => new THREE.Color(c));
  }

  /** `high` on high quality, `low` otherwise (instance and particle counts). */
  q(high: number, low: number): number {
    return this.high ? high : low;
  }

  festiveColor(): THREE.Color {
    return pick(this.rng, this.festive).clone();
  }

  /** A light: an emissive solid plus an optional halo sprite at its centre. */
  lamp(geo: THREE.BufferGeometry, at: V3, color: THREE.ColorRepresentation, halo: number, motion?: Motion, tw?: Twinkle): void {
    this.lights.add(geo, color, T(at[0], at[1], at[2]), motion, tw);
    if (halo > 0) this.halos.point(at, color, halo, motion, tw);
  }

  crowd(spot: CrowdSpot): void {
    this.crowdSpots.push(spot);
  }

  particles(additive: boolean, hardness: number): Particles {
    const p = new Particles(additive, hardness);
    this.particleSets.push(p);
    return p;
  }

  /** Adds a ready-made object (e.g. a shader screen) the kit should own and dispose. */
  addObject(obj: THREE.Object3D, ...disposables: { dispose(): void }[]): void {
    this.group.add(obj);
    this.owned.push(...disposables);
  }

  private mesh(bucket: Bucket, mat: THREE.Material, name: string): void {
    if (bucket.vertexCount === 0) {
      mat.dispose();
      return;
    }
    const geo = bucket.geometry();
    const obj = new THREE.Mesh(geo, mat);
    obj.name = name;
    this.addObject(obj, geo, mat);
  }

  finish(radius: number): Landmark {
    this.mesh(this.solid, solidMaterial(this.u, false), 'solid');
    this.mesh(this.moving, solidMaterial(this.u, true), 'moving');
    this.mesh(this.lights, glowMaterial(this.u), 'lights');
    this.mesh(this.beams, beamMaterial(this.u), 'beams');
    if (this.halos.vertexCount > 0) {
      const geo = this.halos.geometry();
      const mat = pointsMaterial(this.u, { additive: true, kinetic: true, ballistic: false, hardness: HALO_HARDNESS, strength: HALO_DAY + (HALO_DUSK - HALO_DAY) * this.dusk });
      const pts = new THREE.Points(geo, mat);
      pts.name = 'halos';
      trackDrawingBuffer(pts, mat);
      this.addObject(pts, geo, mat);
    }
    if (this.crowdSpots.length > 0) {
      const mesh = buildCrowd(this.crowdSpots, this.u, this.rng);
      this.addObject(mesh, mesh.geometry, mesh.material as THREE.Material);
    }
    this.particleSets.forEach((p, i) => {
      if (p.count === 0) return;
      const pts = p.build(this.u);
      pts.name = `particles${i}`;
      this.addObject(pts, pts.geometry, pts.material as THREE.Material);
    });
    const u = this.u;
    const owned = this.owned;
    return {
      group: this.group,
      radius,
      update(time: number) {
        u.uTime.value = time;
      },
      dispose() {
        for (const d of owned) d.dispose();
      },
    };
  }
}
