// Per-device debug switches (not part of the career save): whether debug mode is on (it adds
// the Results "copy race log" button), whether races show the performance readout, which
// parts of a world's look are on (so each effect and its frame rate can be judged on a phone),
// and the owner's physics tuning, the multipliers every race on this device starts with.
import type { KeyValueStore } from '../game/save.ts';
import type { PhysicsTuning } from '../core/types.ts';
import { PHYSICS_AS_TUNED } from '../core/handling.ts';
import { LOOK_FLAGS_ON, type LookFlags } from '../render/look/look.ts';

const KEY = 'mirage-racer.debug';

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
  return { enabled: o.enabled === true, perfOverlay: o.perfOverlay === true, look: parseLook(o.look, raw), physics: parsePhysics(o.physics, raw) };
}

/** Flags stored before the physics tuning existed have none: the game as tuned. */
function parsePhysics(v: unknown, raw: string): PhysicsTuning {
  if (v === undefined) return { ...PHYSICS_AS_TUNED };
  if (typeof v !== 'object' || v === null) throw new Error(`Bad physics tuning in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  const out = { ...PHYSICS_AS_TUNED };
  for (const k of Object.keys(PHYSICS_AS_TUNED) as (keyof PhysicsTuning)[]) {
    const x = o[k];
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
  store.setItem(KEY, JSON.stringify(flags));
}
