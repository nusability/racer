// The avalanche slope: a steep snow face rising straight off the road, ribbed with rock bands,
// crowned with overhanging cornices that stream spindrift into the sky, its flanks fenced with
// snow barriers. Bound as a dropper it lets go: an avalanche exploder flashes on the crown, and
// blocks of snow and ice break loose, tumble down the fall line trailing powder and leap off the
// foot of the slope to land exactly on the dropper's spots as their warning ends.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { T, beam, box, mix, vary } from '../b/shapes.ts';
import { quadPts } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { smoke } from '../c/kit.ts';
import { brush, col, glowBoost } from '../a/kit.ts';
import { DARK, ICE, ICE_DEEP, IceKit, RoadFrame, SAFETY, bindHazard, hide, smooth01 } from './kit.ts';

const SALT = 0xa7a1a;
const RADIUS = 230;
/** The face: from its foot (local z) up to the ridge, across ±HALF_W. */
const FOOT_Z = -RADIUS * 0.86;
const RIDGE_Z = RADIUS * 0.55;
const HALF_W = RADIUS * 0.95;
const RIDGE_H = 190;
const GRID = { high: [26, 14], low: [16, 9] } as const;
/** Height profile up the face: steepening toward the crown (concave like a real avalanche path). */
const PROFILE = 1.6;
/** Blocks break loose from this far up the face (0 = foot, 1 = ridge). */
const RELEASE = 0.55;
/** Share of the warning spent tumbling down the face; the rest is the leap onto the road. */
const SLIDE_SHARE = 0.68;
const LEAP_H = 16;
const MAX_BLOCKS = 16;
const CORNICES = { high: 14, low: 8 } as const;
const PLUMES = { high: 90, low: 44 } as const;
const FENCES = { high: 7, low: 4 } as const;
const TRAIL_RATE = 0.035;
const BURST = 12;
const ROCK_BANDS = 0.32;
const RIBS = { high: 7, low: 4 } as const;
/** Summits behind the crest: [x × half-width, z past the ridge, height, base radius]. */
const PEAKS: readonly (readonly [number, number, number, number])[] = [[-0.45, 70, 300, 120], [0.2, 110, 340, 140], [0.75, 60, 260, 100]];
/** A summit is snow above this share of its height, rock below. */
const PEAK_SNOWLINE = 0.38;

/** Ground height of the face at local (x, z). */
function faceHeight(x: number, z: number): number {
  if (z <= FOOT_Z) return 0;
  const u = Math.min(1, (z - FOOT_Z) / (RIDGE_Z - FOOT_Z));
  const ridge = RIDGE_H * (1 + 0.16 * Math.sin(x * 0.019 + 1.3) + 0.09 * Math.sin(x * 0.047));
  const edge = 1 - smooth01((Math.abs(x) - HALF_W * 0.75) / (HALF_W * 0.25));
  const gully = 1 - 0.12 * Math.exp(-((x / 50) ** 2)) * Math.sin(Math.PI * u);
  return ridge * u ** PROFILE * edge * gully + (z > RIDGE_Z ? -(z - RIDGE_Z) * 1.4 * edge : 0);
}

interface Block {
  bone: THREE.Bone;
  spin: THREE.Vector3;
  wasWarn: boolean;
}

export function createAvalancheSlope(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('avalancheSlope', opts, ['dropper'] as const, {
    def: { type: 'dropper', id: 'free', from: 0, to: 0, count: 5, radius: 4, period: 11, warn: 2.6, stay: 3, phase: 0 },
    roadZ: -RADIUS * 0.95,
    lateral: -1,
    minX: -10,
    maxX: 10,
    span: RADIUS * 1.2,
  });
  const def = bound.def;
  if (def.count > MAX_BLOCKS) throw new Error(`avalancheSlope: dropper ${def.id} drops ${def.count} blocks; it can show ${MAX_BLOCKS}`);
  const boost = glowBoost(opts.palette);
  const snow = ik.snow;
  const rock = mix(opts.palette.rock, DARK, 0.3);

  // --- The face: one flat-shaded quad per cell, rock where it is steep and banded ---
  const [nx, nz] = kit.high ? GRID.high : GRID.low;
  const at = (i: number, j: number): V3 => {
    const x = -HALF_W + (2 * HALF_W * i) / nx;
    const z = FOOT_Z + ((RIDGE_Z + 40 - FOOT_Z) * j) / nz;
    return [x, faceHeight(x, z), z];
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const rise = (c[1] + d[1] - a[1] - b[1]) / 2 / ((RIDGE_Z + 40 - FOOT_Z) / nz);
      const band = Math.sin(j * 1.7 + i * 0.4 + Math.sin(i * 0.9) * 1.5);
      const isRock = rise > 1.1 && band > 1 - ROCK_BANDS * 2;
      const color = isRock ? vary(rng, rock, 0.08) : vary(rng, mix(snow, ICE, rng() * 0.25), 0.03);
      kit.solid.add(quadPts(a, b, c, d), color);
    }
  }
  // Rock ribs breaking through the snow between the gullies, and summits standing behind the
  // crest: the dark-and-white silhouette that announces the slope from kilometres out.
  for (let k = 0; k < ik.q(RIBS.high, RIBS.low); k++) {
    const x = -HALF_W * 0.8 + (k + 0.3 + rng() * 0.4) * ((HALF_W * 1.6) / ik.q(RIBS.high, RIBS.low));
    for (let j = 0; j < 4; j++) {
      const u = 0.3 + j * 0.16 + rng() * 0.08;
      const z = FOOT_Z + (RIDGE_Z - FOOT_Z) * u;
      const y = faceHeight(x, z);
      const g = new THREE.IcosahedronGeometry(1, 0);
      kit.solid.add(g, vary(rng, rock, 0.1), T(x + (rng() - 0.5) * 10, y - 2, z, (rng() - 0.5) * 0.5, -0.9, 0, [4 + rng() * 4, 4 + rng() * 3, 18 + rng() * 12]));
    }
  }
  PEAKS.forEach(([px, pz, ph, pr], k) => {
    const x = px * HALF_W;
    const z = RIDGE_Z + pz;
    const ry = k * 1.3 + rng();
    // One cone in two bands that meet edge to edge at the snowline. A snow cone laid over a rock
    // one would sit in the same planes and fight it for depth at the distances summits are seen.
    const line = ph * PEAK_SNOWLINE;
    const rLine = pr * (1 - PEAK_SNOWLINE);
    kit.solid.add(new THREE.CylinderGeometry(rLine, pr, line, 5, 1, true).translate(0, line / 2, 0), vary(rng, rock, 0.06), T(x, 0, z, ry));
    kit.solid.add(new THREE.ConeGeometry(rLine, ph - line, 5, 1, true).translate(0, line + (ph - line) / 2, 0), snow, T(x, 0, z, ry));
    kit.solid.add(new THREE.ConeGeometry(pr * 0.9, ph * 0.25, 5, 1).translate(0, ph * 0.125, 0), mix(snow, ICE, 0.3), T(x, 0, z, ry + 0.4));
  });
  // Cornices: overhanging lips of snow along the ridge, the blue shadow under each.
  const nC = ik.q(CORNICES.high, CORNICES.low);
  const plumes = kit.particles(false, 0.9);
  for (let k = 0; k < nC; k++) {
    const x = -HALF_W * 0.7 + (k + rng() * 0.6) * ((HALF_W * 1.4) / nC);
    const y = faceHeight(x, RIDGE_Z);
    const w = (HALF_W * 1.4) / nC + 6;
    kit.solid.add(box(w, 7, 16), snow, T(x, y - 3, RIDGE_Z - 8, (rng() - 0.5) * 0.2, -0.35));
    kit.solid.add(box(w * 0.9, 3, 4), mix(ICE_DEEP, snow, 0.5), T(x, y - 6, RIDGE_Z - 15, 0, -0.2));
  }
  // Spindrift streaming off the crest, lit by the low sun: the slope's signature from afar.
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * HALF_W * 0.45 + (rng() - 0.5) * 30;
    smoke(plumes, rng, [x, faceHeight(x, RIDGE_Z) + 4, RIDGE_Z], { count: ik.q(PLUMES.high, PLUMES.low) / 3, color: mix(snow, 0xffffff, 0.5), size: 12, rise: 3, wind: [30, 4, -4], period: 7, spread: 40, grow: 0.35 });
  }
  // Snow fences on the flanks (rows of dark slats) and an avalanche-control hut with beacons.
  for (let k = 0; k < ik.q(FENCES.high, FENCES.low); k++) {
    const side = k % 2 ? 1 : -1;
    const x0 = side * (HALF_W * 0.35 + rng() * HALF_W * 0.25);
    const z = FOOT_Z + (RIDGE_Z - FOOT_Z) * (0.35 + rng() * 0.4);
    for (let s = 0; s < 6; s++) {
      const x = x0 + s * 7 * side;
      const y = faceHeight(x, z);
      kit.solid.add(box(6.5, 3.2, 0.4), DARK, T(x, y + 0.4, z, 0, -0.5));
      kit.solid.add(beam([x - 3, y, z], [x - 3, y + 4, z - 1.5], 0.25), DARK);
    }
  }
  const hutX = HALF_W * 0.55;
  const hutZ = FOOT_Z + 25;
  kit.solid.add(box(12, 6, 9), SAFETY, T(hutX, 0, hutZ));
  kit.solid.add(box(13, 1.5, 10), snow, T(hutX, 6, hutZ));
  kit.solid.add(beam([hutX + 4, 7, hutZ], [hutX + 4, 20, hutZ], 0.3), DARK);
  kit.lamp(new THREE.OctahedronGeometry(0.9), [hutX + 4, 20.6, hutZ], 0xffa020, 0, undefined, { depth: 0.95, freq: 5, phase: 0, sharp: 8 });
  kit.lamp(box(2, 1.2, 0.2), [hutX - 2, 3.4, hutZ - 4.6], 0xffe0a0, 0);

  // --- Falling blocks and exploder flashes: rig bones posed from the dropper ---
  const blocks: Block[] = [];
  for (let i = 0; i < def.count; i++) {
    const bone = rig.bone();
    rig.add(new THREE.IcosahedronGeometry(1, 0), mix(snow, ICE, 0.2 + rng() * 0.3), { bone, m: T(0, 0, 0, 0, 0, 0, [1.1, 0.85, 1]) });
    rig.add(new THREE.IcosahedronGeometry(0.55, 0), mix(ICE, ICE_DEEP, 0.4), { bone, m: T(0.5, -0.3, 0.3) });
    hide(bone);
    blocks.push({ bone, spin: new THREE.Vector3(2 + rng() * 3, rng() * 2, 1 + rng() * 2), wasWarn: false });
  }
  const flashes: THREE.Bone[] = [];
  for (let i = 0; i < def.count; i++) {
    const b = rig.bone();
    rig.add(new THREE.IcosahedronGeometry(1, 1), 0xfff0c0, { bone: b, layer: 'glow' });
    hide(b);
    flashes.push(b);
  }

  const cloud = ik.cloud(ik.q(520, 260), 0, false, 0.75);
  cloud.setFogScale(0.6);
  const powder = brush({ life: 2.6, size0: 5, size1: 22, c0: snow, c1: mix(snow, opts.palette.horizon, 0.5), alpha: 0.85, keep: 0.45, lift: 1 });
  const burst = brush({ life: 2.2, size0: 6, size1: 24, c0: col(0xffffff), c1: mix(snow, opts.palette.horizon, 0.4), alpha: 0.6, keep: 0.3, lift: 0.5 });

  const h = bound.hazard;
  const items: DropItem[] = [];
  const road = new RoadFrame(bound.binding);
  const L = new THREE.Vector3();
  const S = new THREE.Vector3();
  const F = new THREE.Vector3();
  const P = new THREE.Vector3();
  let trailAcc = 0;

  /** Where block i is at warning progress p: tumbling down the fall line, then leaping onto L. */
  function path(p: number, out: THREE.Vector3): number {
    const sx = THREE.MathUtils.clamp(L.x, -HALF_W * 0.6, HALF_W * 0.6);
    const zr = FOOT_Z + (RIDGE_Z - FOOT_Z) * RELEASE;
    S.set(sx, faceHeight(sx, zr), zr);
    F.set(sx + (L.x - sx) * 0.6, 0, FOOT_Z + 4);
    F.y = faceHeight(F.x, F.z);
    if (p < SLIDE_SHARE) {
      const u = (p / SLIDE_SHARE) ** 1.5;
      out.lerpVectors(S, F, u);
      out.y = faceHeight(out.x, out.z) + Math.abs(Math.sin(u * Math.PI * 4)) * 6 * (1 - u * 0.5);
      return u;
    }
    const u = (p - SLIDE_SHARE) / (1 - SLIDE_SHARE);
    out.lerpVectors(F, L, u);
    out.y += LEAP_H * 4 * u * (1 - u);
    return 1;
  }

  function update(time: number, dt: number): void {
    dropperItems(h, time, items);
    const r = def.radius;
    let trailNow = false;
    trailAcc += dt;
    if (trailAcc > TRAIL_RATE) {
      trailAcc -= TRAIL_RATE;
      trailNow = dt > 0;
    }
    items.forEach((it, i) => {
      const b = blocks[i];
      const fl = flashes[i];
      road.at(it.s);
      if (it.stage !== 'warn') {
        // Landed: the track scene draws it from here on. Mark the impact with a burst.
        if (b.wasWarn && it.stage === 'down' && dt > 0) {
          road.point(it.x, 0, P);
          for (let k = 0; k < BURST; k++) cloud.emit(burst, P.x, P.y + 1, P.z, (rng() - 0.5) * 24, 4 + rng() * 10, (rng() - 0.5) * 24);
        }
        b.wasWarn = false;
        hide(b.bone);
        hide(fl);
        return;
      }
      b.wasWarn = true;
      road.point(it.x, r * BLOCK_REST, L);
      path(it.progress, b.bone.position);
      const t = it.progress * def.warn;
      b.bone.rotation.set(b.spin.x * t, b.spin.y * t, b.spin.z * t);
      b.bone.scale.setScalar(r * road.unit);
      // The exploder: a flash on the crown the moment the block is released.
      const flash = 1 - smooth01(t / FLASH_TIME);
      if (flash > 0) {
        fl.position.copy(S).setY(S.y + 3);
        fl.scale.setScalar((2 + 10 * (1 - flash)) * flash * boost);
      } else hide(fl);
      if (trailNow) {
        const pos = b.bone.position;
        cloud.emit(powder, pos.x, pos.y, pos.z, (rng() - 0.5) * 6, 3 + rng() * 3, (rng() - 0.5) * 6);
        if (it.progress < SLIDE_SHARE) cloud.emit(powder, pos.x + (rng() - 0.5) * 16, pos.y - 2, pos.z + 6, (rng() - 0.5) * 8, 2, -4);
      }
    });
  }

  return ik.finish(RADIUS, RADIUS * 1.6, RIDGE_H, update);
}

/** Block centre above the road when it lands, × radius (it rests on its flattened base). */
const BLOCK_REST = 0.85;
/** How long the exploder flash on the crown lasts, seconds. */
const FLASH_TIME = 0.5;
