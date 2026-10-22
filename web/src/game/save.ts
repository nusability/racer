// The versioned save blob. Prototype stage: a save from another version, or one that fails to
// parse or validate, is replaced by a fresh one (with a console warning) rather than migrated.
import type { UpgradeId } from '../core/types.ts';
import { CUPS, cupById } from '../data/championships.ts';
import { RACERS, racerById } from '../data/racers.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES, noUpgrades } from '../data/upgrades.ts';
import type { UpgradeLevels } from '../data/upgrades.ts';
import type { Settings } from './types.ts';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'mirage-racer.save';
/** How many applied race ids are remembered to make applying an outcome idempotent. */
export const APPLIED_RACE_MEMORY = 16;

export interface CupRun {
  cupId: string;
  /** Index of the next race to run (0..3); equals the race count once the cup is decided. */
  raceIndex: number;
  /** Championship points per entrant id. */
  points: Record<string, number>;
}

export interface TrackRecord {
  bestLap: number | null;
  /** Best race time per lap count ("3" → seconds). */
  bestRace: Record<string, number>;
}

export interface SaveData {
  version: number;
  credits: number;
  ownedRacers: string[];
  selectedRacer: string;
  /** Upgrade levels per owned racer id. */
  upgrades: Record<string, UpgradeLevels>;
  cup: CupRun | null;
  unlockedCups: string[];
  wonCups: string[];
  champion: boolean;
  records: Record<string, TrackRecord>;
  settings: Settings;
  /** Increments per applied race; names the next race id and seeds it. */
  raceSerial: number;
  appliedRaceIds: string[];
}

/** Minimal storage surface so the career also runs headless (node) with a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(): Settings {
  return { steering: 'drag', sensitivity: 1, sound: true, quality: 'high' };
}

export function freshSave(): SaveData {
  const starter = RACERS.find((r) => r.price === 0);
  if (!starter) throw new Error('No free starter racer in RACERS');
  return {
    version: SAVE_VERSION,
    credits: 0,
    ownedRacers: [starter.id],
    selectedRacer: starter.id,
    upgrades: { [starter.id]: noUpgrades() },
    cup: null,
    unlockedCups: [CUPS[0].id],
    wonCups: [],
    champion: false,
    records: {},
    settings: defaultSettings(),
    raceSerial: 1,
    appliedRaceIds: [],
  };
}

class SaveInvalid extends Error {}

function check(cond: boolean, what: string): void {
  if (!cond) throw new SaveInvalid(what);
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function validLevels(v: unknown): boolean {
  if (!isObj(v)) return false;
  return UPGRADES.every((u) => {
    const lvl = v[u.id as UpgradeId];
    return isInt(lvl) && lvl >= 0 && lvl <= MAX_UPGRADE_LEVEL;
  });
}

function validSettings(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    (v.steering === 'drag' || v.steering === 'tilt' || v.steering === 'buttons') &&
    typeof v.sensitivity === 'number' &&
    v.sensitivity >= 0.5 &&
    v.sensitivity <= 1.5 &&
    typeof v.sound === 'boolean' &&
    (v.quality === 'low' || v.quality === 'high')
  );
}

/** Throws SaveInvalid (or an unknown-id error from the catalogues) on any mismatch. */
function validate(d: Record<string, unknown>): SaveData {
  check(d.version === SAVE_VERSION, `version ${String(d.version)}`);
  check(isInt(d.credits) && d.credits >= 0, 'credits');
  check(isStrArr(d.ownedRacers) && d.ownedRacers.length > 0, 'ownedRacers');
  const owned = d.ownedRacers as string[];
  owned.forEach(racerById);
  check(typeof d.selectedRacer === 'string' && owned.includes(d.selectedRacer), 'selectedRacer');
  check(isObj(d.upgrades), 'upgrades');
  const upgrades = d.upgrades as Record<string, unknown>;
  check(owned.every((id) => validLevels(upgrades[id])), 'upgrade levels');
  if (d.cup !== null) {
    check(isObj(d.cup), 'cup');
    const cup = d.cup as Record<string, unknown>;
    check(typeof cup.cupId === 'string' && isInt(cup.raceIndex) && isObj(cup.points), 'cup run');
    const def = cupById(cup.cupId as string);
    check((cup.raceIndex as number) >= 0 && (cup.raceIndex as number) <= def.trackIds.length, 'cup raceIndex');
    check(Object.values(cup.points as object).every(isInt), 'cup points');
  }
  check(isStrArr(d.unlockedCups) && d.unlockedCups.length > 0, 'unlockedCups');
  check(isStrArr(d.wonCups), 'wonCups');
  (d.unlockedCups as string[]).forEach(cupById);
  (d.wonCups as string[]).forEach(cupById);
  check(typeof d.champion === 'boolean', 'champion');
  check(isObj(d.records), 'records');
  for (const rec of Object.values(d.records as object)) {
    check(isObj(rec) && (rec.bestLap === null || typeof rec.bestLap === 'number') && isObj(rec.bestRace), 'record');
  }
  check(validSettings(d.settings), 'settings');
  check(isInt(d.raceSerial) && d.raceSerial >= 1, 'raceSerial');
  check(isStrArr(d.appliedRaceIds), 'appliedRaceIds');
  return d as unknown as SaveData;
}

/**
 * The 'cooling' upgrade became the 'tank' upgrade (heat was replaced by a boost tank). Levels
 * carry over so a player keeps what they paid for.
 */
function renameCoolingToTank(d: Record<string, unknown>): void {
  if (!isObj(d.upgrades)) return;
  for (const levels of Object.values(d.upgrades)) {
    if (!isObj(levels) || !('cooling' in levels) || 'tank' in levels) continue;
    levels.tank = levels.cooling;
    delete levels.cooling;
  }
}

/** Decodes a stored blob; anything unusable becomes a fresh save, loudly. */
export function decodeSave(raw: string | null): SaveData {
  if (raw === null) return freshSave();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) throw new SaveInvalid('not an object');
    renameCoolingToTank(parsed);
    return validate(parsed);
  } catch (err) {
    console.warn('[save] Stored save is unusable; starting a fresh one (prototype saves may reset).', err);
    return freshSave();
  }
}

export function loadSave(store: KeyValueStore): SaveData {
  return decodeSave(store.getItem(SAVE_KEY));
}

export function writeSave(store: KeyValueStore, save: SaveData): void {
  store.setItem(SAVE_KEY, JSON.stringify(save));
}

/** The race runtime reads settings at launch through this, so it needs no career handle. */
export function loadSettings(store: KeyValueStore): Settings {
  return loadSave(store).settings;
}
