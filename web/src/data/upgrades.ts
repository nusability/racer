// Upgrades: five tracks of five levels. effectiveStats is the one place stats are derived.
import type { RacerDef, RacerStats, UpgradeId } from '../core/types.ts';

export const MAX_UPGRADE_LEVEL = 5;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Cost of reaching level 1..5. */
  costs: number[];
  /** Applied once per level. */
  apply: (s: RacerStats) => void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'engine',
    name: 'Engines',
    blurb: 'Top speed and pull.',
    costs: [600, 1400, 2800, 5000, 8500],
    apply: (s) => {
      s.topSpeed *= 1.035;
      s.accel *= 1.03;
    },
  },
  {
    id: 'thrusters',
    name: 'Boost thrusters',
    blurb: 'More kick when you boost.',
    costs: [500, 1200, 2400, 4200, 7000],
    apply: (s) => {
      s.boostPower += 0.03;
      s.accel *= 1.03;
    },
  },
  {
    id: 'steering',
    name: 'Steering vanes',
    blurb: 'Sharper turns, less slide.',
    costs: [400, 1000, 2000, 3600, 6000],
    apply: (s) => {
      s.handling *= 1.05;
      s.grip = Math.min(0.95, s.grip + 0.03);
    },
  },
  {
    id: 'cooling',
    name: 'Coolant',
    blurb: 'Boost longer before overheating.',
    costs: [400, 900, 1800, 3200, 5500],
    apply: (s) => {
      s.cooling *= 1.12;
    },
  },
  {
    id: 'armor',
    name: 'Armour',
    blurb: 'Survive harder hits.',
    costs: [300, 800, 1600, 3000, 5000],
    apply: (s) => {
      s.armor *= 1.12;
    },
  },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export function noUpgrades(): UpgradeLevels {
  return { engine: 0, thrusters: 0, steering: 0, cooling: 0, armor: 0 };
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
