// Per-device debug switches (not part of the career save): whether debug mode is on (it adds
// the Results "copy race log" button) and whether races show the performance readout.
import type { KeyValueStore } from '../game/save.ts';

const KEY = 'mirage-racer.debug';

export interface DebugFlags {
  enabled: boolean;
  perfOverlay: boolean;
}

export function loadDebugFlags(store: KeyValueStore): DebugFlags {
  const raw = store.getItem(KEY);
  if (raw === null) return { enabled: false, perfOverlay: false };
  const v: unknown = JSON.parse(raw);
  if (typeof v !== 'object' || v === null) throw new Error(`Bad debug flags in storage: ${raw}`);
  const o = v as Record<string, unknown>;
  return { enabled: o.enabled === true, perfOverlay: o.perfOverlay === true };
}

export function saveDebugFlags(store: KeyValueStore, flags: DebugFlags): void {
  store.setItem(KEY, JSON.stringify(flags));
}
