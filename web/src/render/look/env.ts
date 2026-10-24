import * as THREE from 'three';
import type { EnvCanopyLook, EnvLook, EnvRidgeLook, EnvTowersLook } from './lookTuning.ts';

// The environment the gliders reflect, painted once per race into a small half-float equirect
// and pre-filtered by PMREM (so any roughness reads it with a few taps, never per frame). One
// painter for every world: a sky graded from the haze at the horizon to the zenith, the ground
// below mirroring the haze near the horizon, and whatever the world's look adds on top: a sun
// bright enough to glint, a ring of mesas or peaks, a neon skyline.

/** Window grid on the reflected towers: storeys and columns per radian, and how many are lit. */
const STOREYS_PER_RAD = 60;
const COLUMNS_PER_RAD = 90;
const LIT_SHARE = 0.4;
/** Office light in the reflected windows: the facades' warm tungsten. */
const WINDOW_COLOR = 0xffc070;
/** Lit windows are this bright next to a tower's neon edge (share of its gain). */
const WINDOW_SHARE = 0.25;
/** A tower's neon edge strip, as a share of its width. */
const EDGE_SHARE = 0.18;
/** Towers span this much azimuth (radians). */
const TOWER_WIDTH: readonly [number, number] = [0.04, 0.14];
/** How the sky eases from the haze to the zenith over `hazeHeight`. */
const SKY_CURVE = 0.6;
/** A ridge's crest is this much lighter than its foot, which sinks into the haze. */
const RIDGE_CREST_LIGHT = 0.15;
/** The canopy closes over this much elevation above where it starts (radians). */
const CANOPY_CLOSE = 0.5;
/** Leaf-cluster cells per radian of the canopy (finer is a busier dapple). */
const CANOPY_CELLS = 14;
/** Leaves overhead are lit from above: their underside, the part a glider sees, is this dark. */
const CANOPY_UNDERSIDE = 0.55;
/** Fixed seed: the reflected horizon is set dressing, the same every race. */
const SEED = 1307;

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

interface Tower {
  az: number;
  half: number;
  top: number;
  neon: THREE.Color;
  seed: number;
}

/** Per column, which towers stand in it (in list order: the first one tall enough wins a pixel). */
function towerColumns(look: EnvTowersLook, w: number) {
  const neon = look.neon.map((c) => new THREE.Color(c));
  const towers: Tower[] = [];
  for (let i = 0; i < look.count; i++) {
    const r = (k: number) => hash(SEED + i * 7.31 + k);
    towers.push({
      az: r(0) * Math.PI * 2 - Math.PI,
      half: (TOWER_WIDTH[0] + (TOWER_WIDTH[1] - TOWER_WIDTH[0]) * r(1)) / 2,
      top: look.height[0] + (look.height[1] - look.height[0]) * r(2),
      neon: neon[Math.floor(r(3) * neon.length)],
      seed: i,
    });
  }
  return Array.from({ length: w }, (_, x) => {
    const az = ((x + 0.5) / w - 0.5) * Math.PI * 2;
    return towers.flatMap((t) => {
      let d = Math.abs(az - t.az);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d > t.half ? [] : [{ t, edge: d > t.half * (1 - EDGE_SHARE) }];
    });
  });
}

/** Ridge height (radians) per column: a few smooth crests round the horizon, closed at ±π. */
function ridgeHeights(look: EnvRidgeLook, w: number): Float32Array {
  const out = new Float32Array(w);
  const phases = [hash(SEED + 1), hash(SEED + 2), hash(SEED + 3)].map((h) => h * Math.PI * 2);
  for (let x = 0; x < w; x++) {
    const az = ((x + 0.5) / w) * Math.PI * 2;
    // Whole-number frequencies so the ring meets itself; the higher harmonics break up the crests.
    const n = look.crests;
    const v = 0.55 * Math.sin(az * n + phases[0]) + 0.3 * Math.sin(az * (2 * n + 1) + phases[1]) + 0.15 * Math.sin(az * (4 * n + 3) + phases[2]);
    const t = Math.max(0, Math.min(1, v * 0.5 + 0.5));
    out[x] = look.height[0] + (look.height[1] - look.height[0]) * t * t;
  }
  return out;
}

/** Per column, whether one of the forest's trunks stands in it round the horizon. */
function trunkColumns(look: EnvCanopyLook, w: number): boolean[] {
  const trunks = Array.from({ length: look.trunks }, (_, i) => ({
    az: hash(SEED + i * 3.17) * Math.PI * 2 - Math.PI,
    half: (look.trunkWidth[0] + (look.trunkWidth[1] - look.trunkWidth[0]) * hash(SEED + i * 5.11 + 1)) / 2,
  }));
  return Array.from({ length: w }, (_, x) => {
    const az = ((x + 0.5) / w - 0.5) * Math.PI * 2;
    return trunks.some((t) => {
      let d = Math.abs(az - t.az);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d <= t.half;
    });
  });
}

/** How much of the sky at (az, el) the leaves hide, 0..1: closing in above `from`, broken by gaps. */
function canopyCover(look: EnvCanopyLook, az: number, el: number): number {
  const t = Math.max(0, Math.min(1, (el - look.from) / CANOPY_CLOSE));
  if (t <= 0) return 0;
  const cell = hash(Math.floor(az * CANOPY_CELLS) * 13.7 + Math.floor(el * CANOPY_CELLS) * 3.1 + SEED);
  return cell < look.cover * t ? 1 : 0;
}

export function worldEnvironment(renderer: THREE.WebGLRenderer, look: EnvLook, sunDir: readonly [number, number, number]): { texture: THREE.Texture; dispose(): void } {
  const w = look.width;
  const h = w / 2;
  const zenith = new THREE.Color(look.zenith);
  const haze = new THREE.Color(look.haze).multiplyScalar(look.hazeGain);
  const ground = new THREE.Color(look.ground);
  const warm = new THREE.Color(WINDOW_COLOR);
  const sun = look.sun;
  const sunCol = sun ? new THREE.Color(sun.color) : null;
  const sunV = new THREE.Vector3(...sunDir).normalize();
  const sunAz = Math.atan2(sunV.z, sunV.x);
  const sunCos = sun ? Math.cos(sun.radius) : 1;
  const columns = look.towers ? towerColumns(look.towers, w) : null;
  const ridge = look.ridge;
  const ridgeH = ridge ? ridgeHeights(ridge, w) : null;
  const ridgeCol = ridge ? new THREE.Color(ridge.color).lerp(haze, ridge.haze) : null;
  const canopy = look.canopy;
  const leaves = canopy ? new THREE.Color(canopy.leaves).multiplyScalar(CANOPY_UNDERSIDE) : null;
  const bark = canopy ? new THREE.Color(canopy.bark) : null;
  const trunkCol = canopy ? trunkColumns(canopy, w) : null;
  const dir = new THREE.Vector3();
  const data = new Uint16Array(w * h * 4);
  const c = new THREE.Color();
  for (let y = 0; y < h; y++) {
    // three's equirect: v = asin(dir.y)/π + 0.5 with row 0 at the bottom, u = atan2(z, x)/2π + 0.5.
    const el = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const az = ((x + 0.5) / w - 0.5) * Math.PI * 2;
      dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      if (el < 0) {
        c.copy(ground).lerp(haze, look.groundHaze * Math.exp(el * look.groundHazeFalloff));
      } else {
        c.copy(haze).lerp(zenith, Math.pow(Math.min(1, el / look.hazeHeight), SKY_CURVE));
        if (sun && sunCol) {
          const toSun = Math.max(0, dir.dot(sunV));
          c.r += sunCol.r * sun.glow * Math.pow(toSun, sun.glowPower);
          c.g += sunCol.g * sun.glow * Math.pow(toSun, sun.glowPower);
          c.b += sunCol.b * sun.glow * Math.pow(toSun, sun.glowPower);
          if (toSun > sunCos) c.copy(sunCol).multiplyScalar(sun.gain);
        }
        if (ridge && ridgeH && ridgeCol && el <= ridgeH[x]) {
          // Lit on the face toward the sun, shaded on the far one; lighter toward the crest.
          let d = az - sunAz;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const lit = 1 + ridge.sunSide * Math.cos(d);
          c.copy(ridgeCol).multiplyScalar(lit * (1 - RIDGE_CREST_LIGHT + RIDGE_CREST_LIGHT * (el / Math.max(1e-4, ridgeH[x]))));
        }
        const hit = columns?.[x].find((o) => el <= o.t.top);
        if (look.towers && hit?.edge) {
          c.copy(hit.t.neon).multiplyScalar(look.towers.gain);
        } else if (look.towers && hit) {
          const lit = hash(hit.t.seed * 31 + Math.floor(el * STOREYS_PER_RAD) * 7 + Math.floor(az * COLUMNS_PER_RAD)) < LIT_SHARE;
          c.copy(ground);
          if (lit) c.copy(warm).multiplyScalar(look.towers.gain * WINDOW_SHARE);
        }
        // Trunks rise from the horizon into the canopy; the canopy hides most of the sky above.
        if (canopy && leaves && bark && trunkCol) {
          if (trunkCol[x] && el < canopy.from + CANOPY_CLOSE) c.copy(bark);
          else if (canopyCover(canopy, az, el) > 0) c.copy(leaves);
        }
      }
      const o = (y * w + x) * 4;
      data[o] = THREE.DataUtils.toHalfFloat(c.r);
      data[o + 1] = THREE.DataUtils.toHalfFloat(c.g);
      data[o + 2] = THREE.DataUtils.toHalfFloat(c.b);
      data[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const equirect = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.LinearSRGBColorSpace;
  equirect.magFilter = THREE.LinearFilter;
  equirect.minFilter = THREE.LinearFilter;
  equirect.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  pmrem.dispose();
  equirect.dispose();
  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
