// The player's career: one spend path (debit), one earn path (applyOutcome), the championship
// state machine and race-request building. Every mutation persists immediately.
import type { RaceResultRow } from '../core/types.ts';
import { CUPS, CUP_POINTS, PLAYER_ENTRANT_ID, cupById } from '../data/championships.ts';
import type { CupDef } from '../data/championships.ts';
import { racerById } from '../data/racers.ts';
import { trackById } from '../data/tracks/index.ts';
import { WORLDS, worldById, worldOfTrack } from '../data/worlds.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES, noUpgrades } from '../data/upgrades.ts';
import type { UpgradeLevels } from '../data/upgrades.ts';
import type { UpgradeId } from '../core/types.ts';
import { racePayout } from './economy.ts';
import type { Payout } from './economy.ts';
import { PLAYER_NAME, championshipGrid, playerEntrant, quickRaceGrid } from './opponents.ts';
import { APPLIED_RACE_MEMORY, loadSave, writeSave } from './save.ts';
import type { KeyValueStore, SaveData } from './save.ts';
import type { RaceOutcome, RaceRequest, Settings } from './types.ts';

export const MIN_QUICK_LAPS = 1;
export const MAX_QUICK_LAPS = 5;

export type PurchaseResult = 'ok' | 'insufficient' | 'owned' | 'maxed';

export interface StandingRow {
  id: string;
  name: string;
  racerId: string;
  points: number;
  isPlayer: boolean;
  /** 1-based. */
  position: number;
}

export interface CupReport {
  cupId: string;
  /** Index of the race just run. */
  raceIndex: number;
  racesTotal: number;
  pointsAwarded: Record<string, number>;
  standings: StandingRow[];
  finished: boolean;
  won: boolean;
  unlockedCupId: string | null;
  /** Worlds this win opened (their rookie cups open with them). */
  unlockedWorldIds: string[];
  /** First win of a world's elite cup. */
  becameChampion: boolean;
}

export interface RaceReport {
  raceId: string;
  request: RaceRequest;
  results: RaceResultRow[];
  playerPlace: number;
  payout: Payout;
  creditsAfter: number;
  newBestLap: boolean;
  newBestRace: boolean;
  cup: CupReport | null;
}

/** FNV-1a: turns a race id into a stable 32-bit seed. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Career {
  readonly save: SaveData;
  private readonly store: KeyValueStore;
  /** Reports by race id, so a repeated apply returns the same answer without paying again. */
  private readonly reports = new Map<string, RaceReport>();

  constructor(store: KeyValueStore) {
    this.store = store;
    this.save = loadSave(store);
  }

  private persist(): void {
    writeSave(this.store, this.save);
  }

  // --- Spending -----------------------------------------------------------

  /** The one debit. */
  private debit(amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 0) throw new Error(`Bad debit amount ${amount}`);
    if (this.save.credits < amount) return false;
    this.save.credits -= amount;
    return true;
  }

  owns(racerId: string): boolean {
    racerById(racerId);
    return this.save.ownedRacers.includes(racerId);
  }

  buyRacer(racerId: string): PurchaseResult {
    const racer = racerById(racerId);
    if (this.owns(racerId)) return 'owned';
    if (!this.debit(racer.price)) return 'insufficient';
    this.save.ownedRacers.push(racerId);
    this.save.upgrades[racerId] = noUpgrades();
    this.save.selectedRacer = racerId;
    this.persist();
    return 'ok';
  }

  selectRacer(racerId: string): void {
    if (!this.owns(racerId)) throw new Error(`Cannot select unowned racer "${racerId}"`);
    this.save.selectedRacer = racerId;
    this.persist();
  }

  /** Levels of an owned racer; unowned racers show stock stats. */
  upgradeLevels(racerId: string): UpgradeLevels {
    return this.owns(racerId) ? this.save.upgrades[racerId] : noUpgrades();
  }

  /** Cost of the next level, or null when maxed. */
  nextUpgradeCost(racerId: string, upgradeId: UpgradeId): number | null {
    const def = UPGRADES.find((u) => u.id === upgradeId);
    if (!def) throw new Error(`Unknown upgrade "${upgradeId}"`);
    const lvl = this.upgradeLevels(racerId)[upgradeId];
    return lvl >= MAX_UPGRADE_LEVEL ? null : def.costs[lvl];
  }

  buyUpgrade(racerId: string, upgradeId: UpgradeId): PurchaseResult {
    if (!this.owns(racerId)) throw new Error(`Cannot upgrade unowned racer "${racerId}"`);
    const cost = this.nextUpgradeCost(racerId, upgradeId);
    if (cost === null) return 'maxed';
    if (!this.debit(cost)) return 'insufficient';
    this.save.upgrades[racerId][upgradeId] += 1;
    this.persist();
    return 'ok';
  }

  setSettings(settings: Settings): void {
    this.save.settings = { ...settings };
    this.persist();
  }

  // --- Championship ---------------------------------------------------------

  // Unlocks are derived from the cups won, so there is one source of truth for progress.

  isWorldUnlocked(worldId: string): boolean {
    const w = worldById(worldId);
    return w.unlockedBy === null || this.save.wonCups.includes(w.unlockedBy);
  }

  /** A world's rookie cup opens with the world; pro and elite open on the previous cup's win. */
  isCupUnlocked(cupId: string): boolean {
    const cup = cupById(cupId);
    if (!this.isWorldUnlocked(cup.worldId)) return false;
    const prev = CUPS.find((c) => c.unlocks === cup.id);
    return !prev || this.save.wonCups.includes(prev.id);
  }

  /** The world's elite cup has been won. */
  isWorldChampion(worldId: string): boolean {
    return this.save.wonCups.includes(worldById(worldId).cupIds[2]);
  }

  /** Quick race on a track: the rivals and pay of its world's hardest open cup. */
  quickRaceCup(trackId: string): CupDef {
    const world = worldOfTrack(trackId);
    if (!this.isWorldUnlocked(world.id)) throw new Error(`Track "${trackId}" is in locked world "${world.id}"`);
    const open = world.cupIds.map(cupById).filter((c) => this.isCupUnlocked(c.id));
    return open.reduce((a, b) => (b.tier > a.tier ? b : a));
  }

  /** Starts (or restarts) a cup; any other run in progress is abandoned. */
  startCup(cupId: string): void {
    if (!this.isCupUnlocked(cupId)) throw new Error(`Cup "${cupId}" is locked`);
    this.save.cup = { cupId, raceIndex: 0, points: {} };
    this.persist();
  }

  abandonCup(): void {
    this.save.cup = null;
    this.persist();
  }

  standings(cup: CupDef, points: Record<string, number>, lastResults: RaceResultRow[] | null): StandingRow[] {
    const lastPlace = new Map(lastResults?.map((r) => [r.id, r.place]) ?? []);
    const rows = [
      { id: PLAYER_ENTRANT_ID, name: PLAYER_NAME, racerId: this.save.selectedRacer, isPlayer: true },
      ...cup.rivals.map((r) => ({ id: r.id, name: r.name, racerId: r.racerId, isPlayer: false })),
    ].map((r) => ({ ...r, points: points[r.id] ?? 0, position: 0 }));
    // Ties go to whoever finished better in the latest race.
    rows.sort((a, b) => b.points - a.points || (lastPlace.get(a.id) ?? 99) - (lastPlace.get(b.id) ?? 99));
    rows.forEach((r, i) => (r.position = i + 1));
    return rows;
  }

  // --- Race requests ----------------------------------------------------------

  private nextRaceId(): string {
    return `race-${this.save.raceSerial}`;
  }

  private player() {
    return playerEntrant(this.save.selectedRacer, this.save.upgrades[this.save.selectedRacer]);
  }

  /** The next race of the cup in progress. */
  nextChampionshipRequest(): RaceRequest {
    const run = this.save.cup;
    if (!run) throw new Error('No cup in progress');
    const cup = cupById(run.cupId);
    if (run.raceIndex >= cup.trackIds.length) throw new Error(`Cup "${cup.id}" is already decided`);
    const track = trackById(cup.trackIds[run.raceIndex]);
    const raceId = this.nextRaceId();
    return {
      raceId,
      mode: 'championship',
      trackId: track.id,
      laps: track.laps,
      seed: hashSeed(`${raceId}:${track.id}`),
      entrants: championshipGrid(cup, run.raceIndex, this.player(), run.points),
      cupId: cup.id,
      raceIndex: run.raceIndex,
    };
  }

  quickRaceRequest(trackId: string, laps: number): RaceRequest {
    const track = trackById(trackId);
    if (!Number.isInteger(laps) || laps < MIN_QUICK_LAPS || laps > MAX_QUICK_LAPS) throw new Error(`Bad lap count ${laps}`);
    const raceId = this.nextRaceId();
    return {
      raceId,
      mode: 'quick',
      trackId: track.id,
      laps,
      seed: hashSeed(`${raceId}:${track.id}`),
      entrants: quickRaceGrid(this.quickRaceCup(track.id), this.player()),
    };
  }

  // --- Earning ------------------------------------------------------------------

  /** The one earn path. Idempotent per race id. */
  applyOutcome(outcome: RaceOutcome): RaceReport {
    const req = outcome.request;
    const cached = this.reports.get(req.raceId);
    if (cached) return cached;
    if (this.save.appliedRaceIds.includes(req.raceId)) throw new Error(`Race ${req.raceId} was already applied`);
    if (req.raceId !== this.nextRaceId()) throw new Error(`Stale race ${req.raceId}; expected ${this.nextRaceId()}`);
    const me = outcome.results.find((r) => r.isPlayer);
    if (!me) throw new Error(`Race ${req.raceId} has no player result`);
    const track = trackById(req.trackId);

    const cup = req.mode === 'championship' ? this.applyCupResult(req, outcome.results) : null;
    const tier = cup ? cupById(cup.report.cupId).tier : this.quickRaceCup(track.id).tier;
    const payout = racePayout({
      mode: req.mode,
      place: me.place,
      tier,
      laps: req.laps,
      standardLaps: track.laps,
      cupWin: cup?.won ? { firstTime: cup.wonFirstTime } : null,
    });
    this.save.credits += payout.total;

    const rec = (this.save.records[track.id] ??= { bestLap: null, bestRace: {} });
    const newBestLap = me.bestLap !== null && (rec.bestLap === null || me.bestLap < rec.bestLap);
    if (newBestLap) rec.bestLap = me.bestLap;
    const prevRace = rec.bestRace[String(req.laps)];
    const newBestRace = me.time !== null && (prevRace === undefined || me.time < prevRace);
    if (newBestRace && me.time !== null) rec.bestRace[String(req.laps)] = me.time;

    this.save.raceSerial += 1;
    this.save.appliedRaceIds = [...this.save.appliedRaceIds, req.raceId].slice(-APPLIED_RACE_MEMORY);
    this.persist();

    const report: RaceReport = {
      raceId: req.raceId,
      request: req,
      results: [...outcome.results].sort((a, b) => a.place - b.place),
      playerPlace: me.place,
      payout,
      creditsAfter: this.save.credits,
      newBestLap,
      newBestRace,
      cup: cup?.report ?? null,
    };
    this.reports.set(req.raceId, report);
    return report;
  }

  private applyCupResult(req: RaceRequest, results: RaceResultRow[]): { report: CupReport; won: boolean; wonFirstTime: boolean } {
    const run = this.save.cup;
    if (!run || run.cupId !== req.cupId || run.raceIndex !== req.raceIndex) {
      throw new Error(`Championship result for ${req.cupId}#${req.raceIndex} does not match the cup in progress`);
    }
    const cup = cupById(run.cupId);
    const awarded: Record<string, number> = {};
    for (const r of results) {
      const pts = CUP_POINTS[r.place - 1];
      if (pts === undefined) throw new Error(`No points for place ${r.place}`);
      awarded[r.id] = pts;
      run.points[r.id] = (run.points[r.id] ?? 0) + pts;
    }
    const raceIndex = run.raceIndex;
    run.raceIndex += 1;
    const standings = this.standings(cup, run.points, results);
    const finished = run.raceIndex >= cup.trackIds.length;
    const won = finished && standings[0].isPlayer;
    const wonFirstTime = won && !this.save.wonCups.includes(cup.id);
    // Only a first win opens anything; winning again just pays the repeat bonus.
    if (wonFirstTime) this.save.wonCups.push(cup.id);
    const unlockedCupId = wonFirstTime ? cup.unlocks : null;
    const unlockedWorldIds = wonFirstTime ? WORLDS.filter((w) => w.unlockedBy === cup.id).map((w) => w.id) : [];
    const becameChampion = wonFirstTime && cup.unlocks === null;
    if (finished) this.save.cup = null;
    return {
      won,
      wonFirstTime,
      report: {
        cupId: cup.id,
        raceIndex,
        racesTotal: cup.trackIds.length,
        pointsAwarded: awarded,
        standings,
        finished,
        won,
        unlockedCupId,
        unlockedWorldIds,
        becameChampion,
      },
    };
  }
}

/** A world's three cups with their state, for the world screen. */
export function cupStates(career: Career, worldId: string): { cup: CupDef; unlocked: boolean; won: boolean; inProgress: boolean }[] {
  return worldById(worldId).cupIds.map(cupById).map((cup) => ({
    cup,
    unlocked: career.isCupUnlocked(cup.id),
    won: career.save.wonCups.includes(cup.id),
    inProgress: career.save.cup?.cupId === cup.id,
  }));
}
