// Upgrades: five tracks of five levels. effectiveStats is the one place stats are derived.
import type { RacerDef, RacerStats, UpgradeId } from '../core/types.ts';

export const MAX_UPGRADE_LEVEL = 5;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Cost of reaching level 1..5 on a starter-class glider; dearer gliders scale it up. */
  costs: number[];
  /** Applied once per level. */
  apply: (s: RacerStats) => void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'engine',
    name: 'Engines',
    blurb: 'Top speed and pull.',
    costs: [550, 1050, 1850, 3050, 4950],
    apply: (s) => {
      s.topSpeed *= 1.035;
      s.accel *= 1.03;
    },
  },
  {
    id: 'thrusters',
    name: 'Boost thrusters',
    blurb: 'More kick when you boost.',
    costs: [500, 900, 1600, 2700, 4400],
    apply: (s) => {
      s.boostPower += 0.03;
      s.accel *= 1.03;
    },
  },
  {
    id: 'steering',
    name: 'Steering vanes',
    blurb: 'Sharper turns, less slide.',
    costs: [450, 800, 1450, 2400, 4000],
    apply: (s) => {
      s.handling *= 1.05;
      s.grip = Math.min(0.95, s.grip + 0.03);
    },
  },
  {
    id: 'tank',
    name: 'Boost tank',
    blurb: 'Store more boost.',
    costs: [400, 700, 1300, 2150, 3500],
    apply: (s) => {
      s.boostTank *= 1.12;
    },
  },
  {
    id: 'armor',
    name: 'Armour',
    blurb: 'Survive harder hits.',
    costs: [300, 650, 1100, 1850, 3050],
    apply: (s) => {
      s.armor *= 1.12;
    },
  },
];

/**
 * Upgrade prices scale with the glider's class (its price), so a dearer glider is a dearer
 * project too: the factor is 1 + price / UPGRADE_CLASS_PRICE_STEP.
 */
export const UPGRADE_CLASS_PRICE_STEP = 40000;
/** Upgrade prices are rounded to this many credits. */
const UPGRADE_PRICE_ROUNDING = 50;

/** Credits to take `upgradeId` on `racer` from `level` to level + 1. */
export function upgradeCost(racer: RacerDef, upgradeId: UpgradeId, level: number): number {
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) throw new Error(`Unknown upgrade "${upgradeId}"`);
  const base = def.costs[level];
  if (base === undefined) throw new Error(`Upgrade ${upgradeId} has no level ${level + 1}`);
  const scaled = base * (1 + racer.price / UPGRADE_CLASS_PRICE_STEP);
  return Math.round(scaled / UPGRADE_PRICE_ROUNDING) * UPGRADE_PRICE_ROUNDING;
}

export type UpgradeLevels = Record<UpgradeId, number>;

export function noUpgrades(): UpgradeLevels {
  return { engine: 0, thrusters: 0, steering: 0, tank: 0, armor: 0 };
}

export function effectiveStats(racer: RacerDef, levels: UpgradeLevels): RacerStats {
  const s: RacerStats = { ...racer.base };
  for (const u of UPGRADES) {
    const lvl = levels[u.id];
    if (lvl < 0 || lvl > MAX_UPGRADE_LEVEL) throw new Error(`Upgrade ${u.id} level ${lvl} out of range`);
    for (let i = 0; i < lvl; i++) u.apply(s);
  }
  return s;
}
