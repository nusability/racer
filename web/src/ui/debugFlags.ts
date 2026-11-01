// Per-device debug switches (not part of the career save): whether debug mode is on (it adds
// the Results "copy race log" button), whether races show the performance readout, which
// parts of a world's look are on (so each effect and its frame rate can be judged on a phone),
// and the owner's physics tuning, the multipliers every race on this device starts with.
import type { KeyValueStore } from '../game/save.ts';
import type { PhysicsTuning } from '../core/types.ts';
import { PHYSICS_AS_TUNED, PHYSICS_BASE } from '../core/handling.ts';
import { LOOK_FLAGS_ON, type LookFlags } from '../render/look/look.ts';

const KEY = 'mirage-racer.debug';
/** The tuning base of flags stored before they recorded PHYSICS_BASE. */
const UNVERSIONED_PHYSICS_BASE = 1;

export interface DebugFlags {
  enabled: boolean;
  perfOverlay: boolean;
  look: LookFlags;
  physics: PhysicsTuning;
}

const AA_MODES: readonly LookFlags['aa'][] = ['level', 'fxaa', 'msaa', 'off'];

export function loadDebugFlags(store: KeyValueStore): DebugFlags {
  const raw = store.getItem(KEY);
  if (raw === null) return { enabled: false, perfOverlay: false, look: { ...LOOK_FLAGS_ON }, physics: { ...PHYSICS_AS_TUNED } };
  const v: unknown = JSON.parse(raw);
  if (typeof v !== 'object' || v === null) throw new Error(`Bad debug flags in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  const flags = { enabled: o.enabled === true, perfOverlay: o.perfOverlay === true, look: parseLook(o.look, raw), physics: parsePhysics(o.physics, raw) };
  const base = o.physicsBase === undefined ? UNVERSIONED_PHYSICS_BASE : o.physicsBase;
  if (base === PHYSICS_BASE) return flags;
  if (!Number.isInteger(base)) throw new Error(`Bad physics base in storage: ${raw}`);
  // Saved against other tuned values: the base now holds what the owner tuned (or has moved on),
  // so the same multipliers would apply twice. Reset them, once, and say so.
  const stale = flags.physics;
  const migrated = { ...flags, physics: { ...PHYSICS_AS_TUNED } };
  saveDebugFlags(store, migrated);
  const changed = (Object.keys(stale) as (keyof PhysicsTuning)[]).filter((k) => stale[k] !== PHYSICS_AS_TUNED[k]);
  if (changed.length > 0) {
    console.info(`debug flags: physics multipliers (${changed.map((k) => `${k} ×${stale[k].toFixed(2)}`).join(', ')}) were set against tuning base ${String(base)}; the base is now ${PHYSICS_BASE}, so they are reset to ×1.00`);
  }
  return migrated;
}

/**
 * Flags stored before the physics tuning existed have none: the game as tuned. Likewise a knob
 * added since the flags were stored (AIR STEERING joined the first four) is as tuned, so a
 * device keeps the owner's other multipliers instead of failing to load them.
 */
function parsePhysics(v: unknown, raw: string): PhysicsTuning {
  if (v === undefined) return { ...PHYSICS_AS_TUNED };
  if (typeof v !== 'object' || v === null) throw new Error(`Bad physics tuning in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  const out = { ...PHYSICS_AS_TUNED };
  for (const k of Object.keys(PHYSICS_AS_TUNED) as (keyof PhysicsTuning)[]) {
    const x = o[k];
    if (x === undefined) continue;
    if (typeof x !== 'number' || !(x > 0)) throw new Error(`Bad physics tuning "${k}" in storage: ${raw}`);
    out[k] = x;
  }
  return out;
}

/** Flags stored before the look switches existed have none: the designed look, all on. */
function parseLook(v: unknown, raw: string): LookFlags {
  if (v === undefined) return { ...LOOK_FLAGS_ON };
  if (typeof v !== 'object' || v === null) throw new Error(`Bad look flags in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  const flags = { ...LOOK_FLAGS_ON };
  for (const k of ['world', 'post', 'bloom', 'blur', 'wet', 'gliders', 'ao', 'haze'] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'boolean') throw new Error(`Bad look flag "${k}" in storage: ${raw}`);
    flags[k] = o[k];
  }
  if (o.aa !== undefined) {
    if (!AA_MODES.includes(o.aa as LookFlags['aa'])) throw new Error(`Bad look flag "aa" in storage: ${raw}`);
    flags.aa = o.aa as LookFlags['aa'];
  }
  return flags;
}

export function saveDebugFlags(store: KeyValueStore, flags: DebugFlags): void {
  store.setItem(KEY, JSON.stringify({ ...flags, physicsBase: PHYSICS_BASE }));
}
