import * as THREE from 'three';
import type { EnvLook } from './lookTuning.ts';

// The environment the gliders reflect: a night sky over a haze band, a ring of lit towers with
// neon edges, and dark street below, painted once per race into a small half-float equirect
// and pre-filtered by PMREM (so any roughness reads it with a few taps, never per frame).

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
/** The street reflects the haze back near the horizon, falling off this fast below it (1/rad). */
const STREET_HAZE_FALLOFF = 14;
const STREET_HAZE_SHARE = 0.35;
/** Fixed seed: the reflected skyline is set dressing, the same every race. */
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

export function cityEnvironment(renderer: THREE.WebGLRenderer, look: EnvLook): { texture: THREE.Texture; dispose(): void } {
  const w = look.width;
  const h = w / 2;
  const zenith = new THREE.Color(look.zenith);
  const haze = new THREE.Color(look.haze).multiplyScalar(look.hazeGain);
  const street = new THREE.Color(look.street);
  const neon = look.neon.map((c) => new THREE.Color(c));
  const warm = new THREE.Color(WINDOW_COLOR);
  const towers: Tower[] = [];
  for (let i = 0; i < look.towers; i++) {
    const r = (k: number) => hash(SEED + i * 7.31 + k);
    towers.push({
      az: r(0) * Math.PI * 2 - Math.PI,
      half: (TOWER_WIDTH[0] + (TOWER_WIDTH[1] - TOWER_WIDTH[0]) * r(1)) / 2,
      top: look.towerHeight[0] + (look.towerHeight[1] - look.towerHeight[0]) * r(2),
      neon: neon[Math.floor(r(3) * neon.length)],
      seed: i,
    });
  }

  // Which towers stand in each column (in list order: the first one tall enough wins a pixel).
  const columns = Array.from({ length: w }, (_, x) => {
    const az = ((x + 0.5) / w - 0.5) * Math.PI * 2;
    return towers.flatMap((t) => {
      let d = Math.abs(az - t.az);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d > t.half ? [] : [{ t, edge: d > t.half * (1 - EDGE_SHARE) }];
    });
  });
  const data = new Uint16Array(w * h * 4);
  const c = new THREE.Color();
  for (let y = 0; y < h; y++) {
    // three's equirect: v = asin(dir.y)/π + 0.5 with row 0 at the bottom.
    const el = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const az = ((x + 0.5) / w - 0.5) * Math.PI * 2;
      if (el < 0) {
        c.copy(street).lerp(haze, STREET_HAZE_SHARE * Math.exp(el * STREET_HAZE_FALLOFF));
      } else {
        c.copy(haze).lerp(zenith, Math.pow(Math.min(1, el / look.hazeHeight), 0.6));
        const hit = columns[x].find((o) => el <= o.t.top);
        if (hit?.edge) {
          c.copy(hit.t.neon).multiplyScalar(look.towerGain);
        } else if (hit) {
          const lit = hash(hit.t.seed * 31 + Math.floor(el * STOREYS_PER_RAD) * 7 + Math.floor(az * COLUMNS_PER_RAD)) < LIT_SHARE;
          c.copy(street);
          if (lit) c.copy(warm).multiplyScalar(look.towerGain * WINDOW_SHARE);
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
