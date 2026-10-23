// Frostline's three cups (rookie, pro, elite). Same strength bands per tier as the desert and
// coast cups: worlds add variety, cups add difficulty. championships.ts adds these to CUPS.
import type { CupDef } from './championships.ts';

export const CUPS_ICE: CupDef[] = [
  {
    id: 'frost',
    worldId: 'ice',
    name: 'Frost Cup',
    tier: 1,
    blurb: 'Snowfields and a frozen harbour. Grip is a rumour.',
    trackIds: ['snowfield', 'frozenharbor', 'glacier', 'icefalls'],
    rivals: [
      { id: 'sigrid', name: 'Sigrid Vale', racerId: 'dustwing', skill: 0.18, upgradeLevel: 0 },
      { id: 'tor', name: 'Tor Rimeholt', racerId: 'dustwing', skill: 0.15, upgradeLevel: 0 },
      { id: 'elka', name: 'Elka Snowmere', racerId: 'dustwing', skill: 0.12, upgradeLevel: 0 },
      { id: 'brann', name: 'Brann Hollowice', racerId: 'dustwing', skill: 0.09, upgradeLevel: 0 },
      { id: 'nisse', name: 'Nisse Quill', racerId: 'dustwing', skill: 0.06, upgradeLevel: 0 },
    ],
    unlocks: 'blizzard',
  },
  {
    id: 'blizzard',
    worldId: 'ice',
    name: 'Blizzard Cup',
    tier: 2,
    blurb: 'Whiteout glaciers and icefalls. Trust the markers, not your eyes.',
    trackIds: ['frozenharbor', 'glacier', 'icefalls', 'avalanche'],
    rivals: [
      { id: 'kari', name: 'Kari Stormlund', racerId: 'scarab', skill: 0.7, upgradeLevel: 0 },
      { id: 'yuri', name: 'Yuri Frostgard', racerId: 'scarab', skill: 0.67, upgradeLevel: 0 },
      { id: 'astrid', name: 'Astrid Pell', racerId: 'scarab', skill: 0.64, upgradeLevel: 0 },
      { id: 'oskar', name: 'Oskar Drift', racerId: 'scarab', skill: 0.61, upgradeLevel: 0 },
      { id: 'liv', name: 'Liv Hailstrom', racerId: 'scarab', skill: 0.58, upgradeLevel: 0 },
    ],
    unlocks: 'aurora',
  },
  {
    id: 'aurora',
    worldId: 'ice',
    name: 'Aurora Crown',
    tier: 3,
    blurb: 'Avalanche runs under the northern lights. The fastest pilots on ice.',
    trackIds: ['glacier', 'icefalls', 'avalanche', 'auroracrown'],
    rivals: [
      { id: 'valka', name: 'Valka Nordhaven', racerId: 'sirocco', skill: 0.7, upgradeLevel: 0 },
      { id: 'rune', name: 'Rune Wintermark', racerId: 'sirocco', skill: 0.68, upgradeLevel: 0 },
      { id: 'isolde', name: 'Isolde Glace', racerId: 'sirocco', skill: 0.66, upgradeLevel: 0 },
      { id: 'fenrik', name: 'Fenrik Shard', racerId: 'sirocco', skill: 0.63, upgradeLevel: 0 },
      { id: 'mira', name: 'Mira Polaris', racerId: 'sirocco', skill: 0.61, upgradeLevel: 0 },
    ],
    unlocks: null,
  },
];
