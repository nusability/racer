// The time-trial ghost: the player's own best lap (or sprint run) as a stream of poses sampled
// at GHOST_HZ, quantised into a few KB, and played back by interpolating between samples.
// Poses, never inputs: a replayed input tape would fly a different line as soon as the physics
// sliders moved, and the ghost exists to compare runs across exactly those changes.
import type { Track } from '../core/track.ts';
import type { RacerState } from '../core/types.ts';
import { posePitch } from '../render/racerPose.ts';
import { GHOST_ANGLE_UNIT, GHOST_DIST_UNIT, GHOST_HZ, GHOST_POS_UNIT, GHOST_STEPS_PER_SAMPLE } from './trialTuning.ts';

/** One pose of the run, in road terms. */
export interface GhostFrame {
  /** Ribbon: -1 the main road, else the branch index. */
  branch: number;
  /** Distance into the lap along the main road, m (a branch maps onto the stretch it skips, as in Race). */
  d: number;
  x: number;
  /** Height above the road. */
  y: number;
  yaw: number;
  pitch: number;
  /** Roll over the road's own bank. */
  roll: number;
  boosting: boolean;
  /** Falling free of the course: no road pose to show, so the ghost is hidden. */
  off: boolean;
}

/** A recorded lap or run: frame i is at lap time t0 + i / GHOST_HZ. */
export interface GhostRun {
  /** The lap (or run) time, s. */
  time: number;
  /** Lap time of the first frame, in (-1/GHOST_HZ, 0]: the sample just before the line. */
  t0: number;
  frames: GhostFrame[];
}

// ---------------------------------------------------------------------------
// Recording

interface Sample extends GhostFrame {
  /** The racer's whole-race distance; d is made lap-relative when its lap is cut. */
  distance: number;
}

/**
 * Samples the player every GHOST_STEPS_PER_SAMPLE sim steps from GO (on the step, so exact)
 * and cuts a GhostRun out of the stream for each completed lap, once the sample just past its
 * line is in.
 */
export class GhostRecorder {
  private readonly track: Track;
  /** Samples from `base` on; older ones belong to laps already cut. */
  private samples: Sample[] = [];
  private base = 0;
  /** Sim steps since GO (GO itself is step 0); null during the countdown. */
  private stepNo: number | null = null;
  private lapStart = 0;
  private lapsDone = 0;
  private readonly pending: { lap: number; start: number; end: number }[] = [];

  constructor(track: Track) {
    this.track = track;
  }

  /**
   * Seconds since GO by this recorder's own count, which keeps running past the finish (the
   * race clock freezes there), so a run's last sample still arrives.
   */
  get time(): number {
    // Counted in whole steps, so a sample's time is exact (no float clock drifting over an hour of laps).
    return this.stepNo === null ? 0 : this.stepNo / (GHOST_STEPS_PER_SAMPLE * GHOST_HZ);
  }

  /** Lap time of the lap in progress. */
  get lapTime(): number {
    return this.time - this.lapStart;
  }

  /** Call after every sim step past the countdown; returns the runs this step completed. */
  step(st: RacerState): GhostRun[] {
    this.stepNo = this.stepNo === null ? 0 : this.stepNo + 1;
    if (this.stepNo % GHOST_STEPS_PER_SAMPLE !== 0) return [];
    this.samples.push(this.sample(st));
    const out: GhostRun[] = [];
    while (this.pending.length > 0 && this.lastSampleTime() >= this.pending[0].end) {
      const p = this.pending.shift() as (typeof this.pending)[number];
      out.push(this.cut(p.lap, p.start, p.end));
    }
    return out;
  }

  /** The player crossed the line this step, `lapTime` after the last crossing (the Race's own lap event). */
  lap(lapTime: number): void {
    const end = this.lapStart + lapTime;
    this.pending.push({ lap: this.lapsDone, start: this.lapStart, end });
    this.lapStart = end;
    this.lapsDone++;
  }

  private lastSampleTime(): number {
    return (this.base + this.samples.length - 1) / GHOST_HZ;
  }

  private sample(st: RacerState): Sample {
    const ribbon = this.track.ribbon(st.branch);
    const off = st.fall !== null;
    return {
      branch: st.branch,
      d: 0,
      distance: st.distance,
      x: off ? 0 : st.x,
      y: off ? 0 : st.y,
      yaw: off ? 0 : wrapAngle(st.yaw),
      pitch: off ? 0 : posePitch(ribbon, st.s, st.vy, st.speed),
      roll: off ? 0 : wrapAngle(st.roll - ribbon.bankAt(st.s)),
      boosting: st.boosting,
      off,
    };
  }

  private cut(lap: number, start: number, end: number): GhostRun {
    const first = Math.max(this.base, Math.floor(start * GHOST_HZ));
    const last = Math.ceil(end * GHOST_HZ);
    const L = this.track.raceLength;
    const frames = this.samples.slice(first - this.base, last - this.base + 1).map(({ distance, ...f }) => ({ ...f, d: distance - lap * L }));
    // The next lap starts with the sample just before this lap's end.
    const keepFrom = Math.floor(end * GHOST_HZ);
    this.samples = this.samples.slice(keepFrom - this.base);
    this.base = keepFrom;
    return { time: end - start, t0: first / GHOST_HZ - start, frames };
  }
}

function wrapAngle(a: number): number {
  const r = (a + Math.PI) % (2 * Math.PI);
  return (r < 0 ? r + 2 * Math.PI : r) - Math.PI;
}

// ---------------------------------------------------------------------------
// Quantised encoding: per frame the flags' change from the last frame, then each field's change
// (second differences for distance, lateral and height, which move smoothly), all as zig-zag
// varints of 4-bit nibbles (3 bits of value each): a steady pose's changes are a unit or two,
// so most fields cost half a byte. Base64 for the JSON it is stored in.

const BRANCH_BITS = 0x3f;
const BOOST_BIT = 0x40;
const OFF_BIT = 0x80;
/** Ribbon -1 is stored as 0, so this many branches fit the flags. */
const MAX_BRANCHES = BRANCH_BITS;
/** A nibble: three bits of value, and a high bit saying another nibble follows. */
const NIBBLE_MORE = 0x8;
const NIBBLE_VALUE = 0x8;
const NIBBLES_PER_BYTE = 2;

type Field = 'd' | 'x' | 'y' | 'yaw' | 'pitch' | 'roll';
const FIELDS: readonly { key: Field; unit: number; order: 1 | 2 }[] = [
  { key: 'd', unit: GHOST_DIST_UNIT, order: 2 },
  { key: 'x', unit: GHOST_POS_UNIT, order: 2 },
  { key: 'y', unit: GHOST_POS_UNIT, order: 2 },
  { key: 'yaw', unit: GHOST_ANGLE_UNIT, order: 1 },
  { key: 'pitch', unit: GHOST_ANGLE_UNIT, order: 1 },
  { key: 'roll', unit: GHOST_ANGLE_UNIT, order: 1 },
];

export function encodeFrames(frames: readonly GhostFrame[]): string {
  const nibbles: number[] = [];
  const prev = FIELDS.map(() => ({ q: 0, dq: 0 }));
  let prevFlags = 0;
  for (const f of frames) {
    if (!Number.isInteger(f.branch) || f.branch < -1 || f.branch + 1 > MAX_BRANCHES) throw new Error(`ghost: branch ${f.branch} does not fit the flags`);
    const flags = (f.branch + 1) | (f.boosting ? BOOST_BIT : 0) | (f.off ? OFF_BIT : 0);
    writeUnsigned(nibbles, flags ^ prevFlags);
    prevFlags = flags;
    FIELDS.forEach((field, i) => {
      const v = f[field.key];
      if (!Number.isFinite(v)) throw new Error(`ghost: ${field.key} is ${v}`);
      const q = Math.round(v / field.unit);
      const p = prev[i];
      const dq = q - p.q;
      writeUnsigned(nibbles, zigzag(field.order === 2 ? dq - p.dq : dq));
      p.q = q;
      p.dq = dq;
    });
  }
  // Two nibbles a byte, high first; an odd count ends on a zero pad.
  const bytes: number[] = [];
  for (let i = 0; i < nibbles.length; i += NIBBLES_PER_BYTE) bytes.push(nibbles[i] * 16 + (nibbles[i + 1] ?? 0));
  return toBase64(bytes);
}

export function decodeFrames(data: string, count: number): GhostFrame[] {
  const bytes = fromBase64(data);
  const src = { bytes, i: 0, n: bytes.length * NIBBLES_PER_BYTE };
  const prev = FIELDS.map(() => ({ q: 0, dq: 0 }));
  const frames: GhostFrame[] = [];
  let flags = 0;
  for (let n = 0; n < count; n++) {
    if (src.i >= src.n) throw new Error(`ghost: data ends after ${n} of ${count} frames`);
    flags ^= readUnsigned(src);
    if (flags > 0xff) throw new Error(`ghost: bad flags ${flags} at frame ${n}`);
    const f: GhostFrame = { branch: (flags & BRANCH_BITS) - 1, d: 0, x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, boosting: (flags & BOOST_BIT) !== 0, off: (flags & OFF_BIT) !== 0 };
    FIELDS.forEach((field, i) => {
      const p = prev[i];
      const v = unzigzag(readUnsigned(src));
      const dq = field.order === 2 ? p.dq + v : v;
      p.q += dq;
      p.dq = dq;
      f[field.key] = p.q * field.unit;
    });
    frames.push(f);
  }
  const left = src.n - src.i;
  if (left > 1 || (left === 1 && bytes[bytes.length - 1] % 16 !== 0)) throw new Error(`ghost: ${left} nibbles left over after ${count} frames`);
  return frames;
}

/** The sign into the low bit, so small changes either way stay small. Plain arithmetic: no 32-bit wrap. */
function zigzag(v: number): number {
  return v >= 0 ? 2 * v : -2 * v - 1;
}

function unzigzag(z: number): number {
  return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
}

/** Low bits first, three to a nibble. */
function writeUnsigned(out: number[], z: number): void {
  while (z >= NIBBLE_VALUE) {
    out.push((z % NIBBLE_VALUE) + NIBBLE_MORE);
    z = Math.floor(z / NIBBLE_VALUE);
  }
  out.push(z);
}

function readUnsigned(src: { bytes: Uint8Array; i: number; n: number }): number {
  let z = 0;
  let scale = 1;
  for (;;) {
    if (src.i >= src.n) throw new Error('ghost: data ends inside a number');
    const byte = src.bytes[Math.floor(src.i / NIBBLES_PER_BYTE)];
    const nib = src.i % NIBBLES_PER_BYTE === 0 ? Math.floor(byte / 16) : byte % 16;
    src.i++;
    z += (nib % NIBBLE_MORE) * scale;
    if (nib < NIBBLE_MORE) return z;
    scale *= NIBBLE_VALUE;
  }
}

function toBase64(bytes: readonly number[]): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(data: string): Uint8Array {
  const s = atob(data);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Playback

/** The ghost's pose at a lap time, on its own ribbon (s resolved from d). */
export interface GhostPose {
  branch: number;
  s: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  boosting: boolean;
}

/**
 * The pose `t` seconds into the lap, interpolated between its two samples; null before the
 * first, after the last, or while the ghost was off the course. Across a change of ribbon
 * the nearer sample is taken as is (their x are on different ribbons): samples are a tenth of a
 * second apart, so snapping to the later one would jump the ghost early.
 */
export function ghostPoseAt(track: Track, run: GhostRun, t: number, out: GhostPose): GhostPose | null {
  const u = (t - run.t0) * GHOST_HZ;
  const i = Math.floor(u);
  if (i < 0 || i >= run.frames.length - 1) return null;
  const a = run.frames[i];
  const b = run.frames[i + 1];
  if (a.off || b.off) return null;
  const k = a.branch === b.branch ? u - i : u - i < 1 / 2 ? 0 : 1;
  const lerp = (p: number, q: number) => p + (q - p) * k;
  const on = k < 1 / 2 ? a : b;
  out.branch = on.branch;
  out.s = ribbonS(track, on.branch, lerp(a.d, b.d));
  out.x = lerp(a.x, b.x);
  out.y = lerp(a.y, b.y);
  out.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
  out.pitch = lerp(a.pitch, b.pitch);
  out.roll = a.roll + wrapAngle(b.roll - a.roll) * k;
  out.boosting = on.boosting;
  return out;
}

/**
 * Where a lap distance lies on a ribbon: the inverse of Race.mainS, which maps a branch
 * linearly onto the main-road stretch it skips.
 */
export function ribbonS(track: Track, branch: number, d: number): number {
  const mainS = track.wrap(track.startS + d);
  if (branch < 0) return mainS;
  const b = track.branches[branch];
  if (!b) throw new Error(`ghost: ${track.def.id} has no branch ${branch}`);
  return b.ribbon.wrap(((mainS - b.entryS) / (b.exitS - b.entryS)) * b.ribbon.length);
}

/**
 * The lap time at which a run reached lap distance `d`: the live delta reads the ghost here,
 * by distance, so it compares the same point of the course whatever the time. Interpolated
 * between samples; a run that ever slipped back counts its furthest reach so far, so the
 * curve stays monotonic and the search well defined. Past the run's last sample it closes
 * on the lap's end (d = lap length at the lap's time).
 */
export class GhostClock {
  private readonly run: GhostRun;
  private readonly reach: Float64Array;
  private readonly length: number;

  constructor(run: GhostRun, lapLength: number) {
    if (run.frames.length === 0) throw new Error('ghost: a run without frames');
    this.run = run;
    this.length = lapLength;
    this.reach = new Float64Array(run.frames.length);
    let max = -Infinity;
    run.frames.forEach((f, i) => (this.reach[i] = max = Math.max(max, f.d)));
  }

  get time(): number {
    return this.run.time;
  }

  timeAt(d: number): number {
    const r = this.reach;
    const n = r.length;
    const tOf = (i: number) => this.run.t0 + i / GHOST_HZ;
    if (d <= r[0]) return Math.max(0, tOf(0));
    if (d >= r[n - 1]) {
      // The stretch from the last sample to the line, unless the samples already passed it.
      if (r[n - 1] >= this.length || tOf(n - 1) >= this.run.time) return Math.min(this.run.time, tOf(n - 1));
      const k = (d - r[n - 1]) / (this.length - r[n - 1]);
      return tOf(n - 1) + (this.run.time - tOf(n - 1)) * Math.min(1, k);
    }
    // First sample at or past d.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (r[mid] >= d) hi = mid;
      else lo = mid;
    }
    const span = r[hi] - r[lo];
    const k = span > 0 ? (d - r[lo]) / span : 1;
    return Math.min(this.run.time, Math.max(0, tOf(lo) + k / GHOST_HZ));
  }
}
