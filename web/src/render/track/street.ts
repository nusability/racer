import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { StreetSection } from '../../data/tracks/scenery.ts';
import type { P3 } from './builder.ts';
import type { Chunk, Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';
import { beatIndex, type Rhythm } from './rhythm.ts';
import { sideIndex, type CorridorShape } from './shape.ts';

// A street section's side of the course (scenery.streets): the race barrier standing on the
// road along the kerb, its inner face on the track's hard boundary, so the wall a racer hits is
// the barrier they see; behind it the pavement up to the building line, or a quay dropping into
// a harbour basin. The city dressing (biomes/cityStreets.ts) puts the buildings, furniture,
// debris fence and markings on it.

/** The race barrier: concrete blocks this tall, this deep at the foot and on top, metres. */
export const BARRIER_H = 1.1;
const BARRIER_FOOT = 0.8;
const BARRIER_TOP = 0.42;
/**
 * The debris fence's top over the road, metres. The street's low things (a single-storey
 * shopfront, a crowd, a kiosk) may stand up to it even where a sightline caps the buildings: the
 * fence in front of them already stands that tall.
 */
export const FENCE_TOP = 4.4;
/** The pavement's top over the road, metres: a kerb's rise. */
export const KERB_H = 0.15;
/** From the hard boundary to the building line: barrier and pavement, metres. */
export const PAVEMENT = 6.5;
/** A harbour side: the quay this wide past the boundary, the water this far under the road, metres. */
export const QUAY = 9;
export const WATER_DROP = 2.4;
/** The quay wall reaches this far under the water, so its foot never shows. */
const QUAY_FOOT = 3;
/**
 * The basin reaches this far past the boundary (no building stands in it), metres: wide enough
 * for a row of moored yachts and open water beyond them, so the far shore reads as distant.
 */
export const BASIN = 150;
/** The building line's skirt drops this far under the pavement (it meets the ground in a side street). */
const SKIRT = 2.5;
/**
 * The barrier's livery: painted blocks of accent and white whose lengths are drawn from this
 * band, so a row racers pass at 400 m/s never strobes (rhythm.ts); the band's height on the face.
 */
export const LIVERY: Rhythm = { gap: [3, 13], salt: 0x5b4e };
const LIVERY_BAND: readonly [number, number] = [0.3, 0.92];
/** Shades of the barrier's faces and the pavement (multiples of the concrete and paving tones). */
const BARRIER_SHADE = 1.08;
const BARRIER_BACK = 0.7;
const PAVEMENT_TONE = 0x8a8a92;
const QUAY_STONE = 0x6c6a66;

/** A street's side counts as walled under this much run-off, metres (track-check holds the same line). */
const WALLED = 1;

/** Main-loop spans of street (and which side is a harbour), as the corridor needs them. */
export type StreetSpans = Pick<StreetSection, 'from' | 'to' | 'harbour' | 'name'>[];

/**
 * Marks the street sections on the main loop's shape and pulls the corridor's reach in to the
 * building line (or out over the basin), so the city builds right up to the pavement. Throws when
 * a section is not a ground-level walled road: the barriers there are the track's walls.
 */
export function markStreets(track: Track, sh: CorridorShape, spans: StreetSpans): void {
  const n = track.samples.length;
  for (const span of spans) {
    const s0 = track.paramToS(span.from);
    const len = track.wrap(track.paramToS(span.to) - s0);
    // The samples a track feature over the same span covers (core/track.ts forRange).
    const k0 = Math.ceil(s0 / track.step - 1e-9);
    for (let q = 0; (k0 + q) * track.step - s0 <= len + 1e-9; q++) {
      const k = (k0 + q) % n;
      const smp = track.samples[k];
      const bad = smp.gap ? 'a chasm' : sh.magnet[k] ? 'a loop or corkscrew' : sh.deck[k] ? 'a deck' : sh.tunnel[k] ? 'a tunnel' : sh.drop[0][k] || sh.drop[1][k] ? 'an open drop' : null;
      if (bad) throw new Error(`street "${span.name}" runs over ${bad} at s=${smp.s.toFixed(0)}: a street section is a walled road at ground level`);
      for (const side of [-1, 1] as const) {
        const i = sideIndex(side);
        if (sh.open[i][k]) continue;
        if (sh.run[i][k] >= WALLED) throw new Error(`street "${span.name}" leaves ${sh.run[i][k].toFixed(0)} m of run-off at s=${smp.s.toFixed(0)}: wall it, the barrier is the track's wall`);
        const harbour = span.harbour === side;
        sh.quay[i][k] = harbour ? 1 : 0;
        sh.outer[i][k] = smp.width / 2 + (harbour ? BASIN : PAVEMENT);
      }
      sh.street[k] = 1;
    }
  }
}

/** Where the street side's pieces stand at sample k: the boundary foot and the lines behind it. */
export interface StreetFrame {
  /** On the hard boundary, at road level. */
  foot: P3;
  /** Horizontal unit vector away from the road. */
  out: P3;
  /** Point `dx` metres out from the boundary at height `y` over the foot. */
  at(dx: number, y: number): P3;
}

export function streetFrame(cor: Corridor, k: number, side: number): StreetFrame {
  const kk = cor.idx(k);
  const foot = cor.banked(kk, side * cor.edge(kk, side), 0);
  const out = { x: cor.shape.rx[kk] * side, y: 0, z: cor.shape.rz[kk] * side };
  return { foot, out, at: (dx, y) => ({ x: foot.x + out.x * dx, y: foot.y + y, z: foot.z + out.z * dx }) };
}

/** The street side between stations ka and kb: barrier, livery, and pavement or quay. */
export function streetStrip(cor: Corridor, c: Chunk, ka: number, kb: number, side: number): void {
  const A = streetFrame(cor, ka, side);
  const B = streetFrame(cor, kb, side);
  const p = cor.paint;
  const quay = cor.shape.quay[sideIndex(side)][cor.idx(ka)] === 1 && cor.shape.quay[sideIndex(side)][cor.idx(kb)] === 1;
  const inward = { x: -A.out.x, y: 0.2, z: -A.out.z };
  const outward = { x: A.out.x, y: 0.2, z: A.out.z };
  const up = { x: 0, y: 1, z: 0 };
  const face = p.rock.clone().multiplyScalar(BARRIER_SHADE);
  const back = p.rock.clone().multiplyScalar(BARRIER_BACK);
  const lean = (BARRIER_FOOT - BARRIER_TOP) / 2;
  // Barrier: the face racers see, its top, its back down to the pavement.
  const q = (dx0: number, y0: number, dx1: number, y1: number, dir: P3, ca: THREE.Color, cb = ca) =>
    quadFacing(c.rock, A.at(dx0, y0), B.at(dx0, y0), B.at(dx1, y1), A.at(dx1, y1), dir, ca, ca, cb, cb);
  q(0, 0, lean, BARRIER_H, inward, face);
  q(lean, BARRIER_H, lean + BARRIER_TOP, BARRIER_H, up, face);
  q(lean + BARRIER_TOP, BARRIER_H, BARRIER_FOOT, KERB_H, outward, back);
  // Livery: painted blocks on the face, accent and white by the beat the segment falls in.
  const s = ((ka + kb) / 2) * cor.ribbon.step;
  const on = beatIndex(LIVERY, cor.ribbon.length, s) % 2 === 0;
  const t0 = LIVERY_BAND[0];
  const t1 = LIVERY_BAND[1];
  const lift = -0.04;
  quadFacing(cor.glow, A.at(lean * t0 + lift, BARRIER_H * t0), B.at(lean * t0 + lift, BARRIER_H * t0), B.at(lean * t1 + lift, BARRIER_H * t1), A.at(lean * t1 + lift, BARRIER_H * t1), inward, on ? p.accent : p.white);
  const pave = new THREE.Color(quay ? QUAY_STONE : PAVEMENT_TONE);
  const reach = quay ? QUAY : PAVEMENT;
  quadFacing(c.sand, A.at(BARRIER_FOOT, KERB_H), B.at(BARRIER_FOOT, KERB_H), B.at(reach, KERB_H), A.at(reach, KERB_H), up, pave);
  // Behind it: the building line's skirt, or the quay wall dropping into the basin.
  const drop = quay ? WATER_DROP + QUAY_FOOT : SKIRT;
  q(reach, KERB_H, reach, -drop, outward, quay ? pave.clone().multiplyScalar(0.7) : back);
}
