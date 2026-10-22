import type { Track } from '../../core/track.ts';
import {
  BERM_HEIGHT,
  CANYON_MIN_HEIGHT,
  CANYON_OUTER,
  CHASM_SIDE,
  SHOULDER_WIDTH,
  TUNNEL_ROCK_WIDTH,
  WALL_TAPER,
} from './config.ts';
import { smoothstep } from './noise.ts';

/**
 * Per-sample cross-section facts shared by the corridor and the ground, so the terrain knows
 * exactly how far the corridor geometry reaches and can tuck itself underneath.
 */
export interface CorridorShape {
  /** Visual side height above the road edge: berm, or a canyon wall tapered at its ends. */
  wall: Float32Array;
  /** 0 = berm and sand shoulder, 1 = full canyon cross-section. */
  canyon: Float32Array;
  /** Lateral reach of the corridor geometry past the road edge, metres. */
  reach: Float32Array;
  tunnel: Uint8Array;
  /** Horizontal unit right vector (bank removed): side geometry stands on world up. */
  rx: Float32Array;
  rz: Float32Array;
}

/** Width over which the canyon factor ramps from berm to full wall, metres of wall height. */
const CANYON_RAMP = 10;

export function corridorShape(track: Track): CorridorShape {
  const n = track.samples.length;
  const wall = new Float32Array(n);
  for (let k = 0; k < n; k++) wall[k] = track.samples[k].wallHeight;
  // Taper both ends: two passes around the loop so the decay wraps the start line too.
  const drop = WALL_TAPER * track.step;
  for (let pass = 0; pass < 2; pass++) {
    for (let q = 1; q <= 2 * n; q++) {
      const k = pass === 0 ? q % n : (2 * n - q) % n;
      const prev = pass === 0 ? (k - 1 + n) % n : (k + 1) % n;
      wall[k] = Math.max(wall[k], wall[prev] - drop);
    }
  }
  const canyon = new Float32Array(n);
  const reach = new Float32Array(n);
  const tunnel = new Uint8Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const smp = track.samples[k];
    wall[k] = Math.max(BERM_HEIGHT, wall[k]);
    canyon[k] = smoothstep((wall[k] - CANYON_MIN_HEIGHT) / CANYON_RAMP);
    tunnel[k] = Number.isFinite(smp.ceiling) ? 1 : 0;
    reach[k] = smp.gap
      ? CHASM_SIDE
      : tunnel[k]
        ? TUNNEL_ROCK_WIDTH
        : SHOULDER_WIDTH + (CANYON_OUTER - SHOULDER_WIDTH) * canyon[k];
    const l = Math.hypot(smp.right.x, smp.right.z);
    rx[k] = smp.right.x / l;
    rz[k] = smp.right.z / l;
  }
  return { wall, canyon, reach, tunnel, rx, rz };
}
