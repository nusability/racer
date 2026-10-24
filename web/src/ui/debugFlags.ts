// Per-device debug switches (not part of the career save): whether debug mode is on (it adds
// the Results "copy race log" button), whether races show the performance readout, and which
// parts of a world's look are on (so each effect and its frame rate can be judged on a phone).
import type { KeyValueStore } from '../game/save.ts';
import { LOOK_FLAGS_ON, type LookFlags } from '../render/look/look.ts';

const KEY = 'mirage-racer.debug';

export interface DebugFlags {
  enabled: boolean;
  perfOverlay: boolean;
  look: LookFlags;
}

const AA_MODES: readonly LookFlags['aa'][] = ['level', 'fxaa', 'msaa', 'off'];

export function loadDebugFlags(store: KeyValueStore): DebugFlags {
  const raw = store.getItem(KEY);
  if (raw === null) return { enabled: false, perfOverlay: false, look: { ...LOOK_FLAGS_ON } };
  const v: unknown = JSON.parse(raw);
  if (typeof v !== 'object' || v === null) throw new Error(`Bad debug flags in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  return { enabled: o.enabled === true, perfOverlay: o.perfOverlay === true, look: parseLook(o.look, raw) };
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
