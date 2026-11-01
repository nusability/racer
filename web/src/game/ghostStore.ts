// Each track's best time-trial ghost, one localStorage key per track, never inside the career
// save: a ghost that fails to decode is dropped on its own (with a console warning) and can
// never take the career down with it.
import { RACERS } from '../data/racers.ts';
import { UPGRADES, type UpgradeLevels } from '../data/upgrades.ts';
import { decodeFrames, encodeFrames, type GhostRun } from './ghost.ts';
import { GHOST_HZ, GHOST_KEY_PREFIX, GHOST_VERSION } from './trialTuning.ts';

/** The physics base of a ghost stored before ghosts recorded it: the first tuning (core/handling.ts PHYSICS_BASE). */
const UNVERSIONED_PHYSICS_BASE = 1;

/** The physics sliders in force for a run (debug menu PHYSICS): name → multiplier. */
export type TrialPhysics = Readonly<Record<string, number>>;

/** A track's best run, with what it was flown with, so a new run can be read against it. */
export interface GhostRecord {
  trackId: string;
  run: GhostRun;
  glider: string;
  upgrades: UpgradeLevels;
  physics: TrialPhysics;
  /** The tuning base its physics multipliers sat on (core/handling.ts PHYSICS_BASE): on another, the same multipliers fly differently. */
  physicsBase: number;
  build: string;
  /** ISO time it was set. */
  date: string;
}

/** The storage a ghost lives in (localStorage in the game, a map in the headless check). */
export interface GhostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Stored {
  v: number;
  track: string;
  time: number;
  t0: number;
  hz: number;
  n: number;
  frames: string;
  glider: string;
  upgrades: UpgradeLevels;
  physics: Record<string, number>;
  /** Absent on a ghost stored before it was recorded: base 1. */
  physicsBase?: number;
  build: string;
  date: string;
}

export const ghostKey = (trackId: string) => `${GHOST_KEY_PREFIX}${trackId}`;

/** The serialised record: what goes under the track's key. */
function encodeGhost(g: GhostRecord): string {
  const stored: Stored = {
    v: GHOST_VERSION,
    track: g.trackId,
    time: g.run.time,
    t0: g.run.t0,
    hz: GHOST_HZ,
    n: g.run.frames.length,
    frames: encodeFrames(g.run.frames),
    glider: g.glider,
    upgrades: g.upgrades,
    physics: { ...g.physics },
    physicsBase: g.physicsBase,
    build: g.build,
    date: g.date,
  };
  return JSON.stringify(stored);
}

/** Throws on anything that is not a whole, current ghost of this track. */
function decodeGhost(trackId: string, raw: string): GhostRecord {
  const v: unknown = JSON.parse(raw);
  const o = isObj(v) ? v : fail('not an object');
  if (o.v !== GHOST_VERSION) fail(`version ${String(o.v)}, expected ${GHOST_VERSION}`);
  if (o.track !== trackId) fail(`recorded on "${String(o.track)}"`);
  if (o.hz !== GHOST_HZ) fail(`sampled at ${String(o.hz)} Hz, expected ${GHOST_HZ}`);
  const time = num(o.time, 'time');
  if (!(time > 0)) fail(`time ${time}`);
  const t0 = num(o.t0, 't0');
  if (!(t0 <= 0 && t0 > -1 / GHOST_HZ - 1e-9)) fail(`t0 ${t0}`);
  const n = num(o.n, 'n');
  if (!Number.isInteger(n) || n < 2) fail(`frame count ${n}`);
  if (typeof o.frames !== 'string') fail('no frames');
  if (typeof o.glider !== 'string' || !RACERS.some((r) => r.id === o.glider)) fail(`unknown glider "${String(o.glider)}"`);
  const up = isObj(o.upgrades) ? o.upgrades : fail('no upgrades');
  for (const u of UPGRADES) if (!Number.isInteger(up[u.id])) fail(`upgrade ${u.id}`);
  const ph = isObj(o.physics) ? o.physics : fail('no physics');
  for (const [k, x] of Object.entries(ph)) if (typeof x !== 'number' || !Number.isFinite(x)) fail(`physics ${k}`);
  const physicsBase = o.physicsBase === undefined ? UNVERSIONED_PHYSICS_BASE : num(o.physicsBase, 'physicsBase');
  if (!Number.isInteger(physicsBase) || physicsBase < UNVERSIONED_PHYSICS_BASE) fail(`physics base ${physicsBase}`);
  if (typeof o.build !== 'string' || typeof o.date !== 'string') fail('no build or date');
  return {
    trackId,
    run: { time, t0, frames: decodeFrames(o.frames, n) },
    glider: o.glider,
    upgrades: up as UpgradeLevels,
    physics: ph as Record<string, number>,
    physicsBase,
    build: o.build,
    date: o.date,
  };
}

/** The track's best ghost, or null when there is none (or it was unreadable and has been dropped). */
export function loadGhost(store: GhostStorage, trackId: string): GhostRecord | null {
  const raw = store.getItem(ghostKey(trackId));
  if (raw === null) return null;
  try {
    return decodeGhost(trackId, raw);
  } catch (err) {
    // A ghost is a comparison aid: a corrupt one is dropped, said so, and the next best run replaces it.
    console.warn(`time trial: dropping the unreadable ghost of ${trackId}`, err);
    store.removeItem(ghostKey(trackId));
    return null;
  }
}

/** Stores the ghost as the track's best; returns its size in bytes (the JSON text). */
export function saveGhost(store: GhostStorage, g: GhostRecord): number {
  const text = encodeGhost(g);
  store.setItem(ghostKey(g.trackId), text);
  return text.length;
}

function fail(why: string): never {
  throw new Error(`bad ghost: ${why}`);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} ${String(v)}`);
  return v;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
