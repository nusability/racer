// Elderwood's three cups (rookie, pro, elite). Same strength bands per tier as every other
// world: worlds add variety, cups add difficulty. Each cup mixes point-to-point sprints through
// the woods with the circuits of the lumber town and the lantern fair, and slides one track up
// the ladder from the cup before, like the city's. championships.ts adds these to CUPS.
import type { CupDef } from './championships.ts';
import { TIER_SKILLS } from './rivalSkills.ts';

export const CUPS_FOREST: CupDef[] = [
  {
    id: 'fernway',
    worldId: 'forest',
    name: 'Fernway Cup',
    tier: 1,
    blurb: 'Mossy trails, the herd crossing and the lumber town streets. Pick your way through.',
    trackIds: ['mossway', 'timberton', 'glowmere', 'lanternfair'],
    rivals: [
      { id: 'rowan', name: 'Rowan Thistle', racerId: 'dustwing', skill: TIER_SKILLS[0][0], upgradeLevel: 0 },
      { id: 'brin', name: 'Brin Hollowell', racerId: 'dustwing', skill: TIER_SKILLS[0][1], upgradeLevel: 0 },
      { id: 'wren', name: 'Wren Ashby', racerId: 'dustwing', skill: TIER_SKILLS[0][2], upgradeLevel: 0 },
      { id: 'tobin', name: 'Tobin Burr', racerId: 'dustwing', skill: TIER_SKILLS[0][3], upgradeLevel: 0 },
      { id: 'fenna', name: 'Fenna Moss', racerId: 'dustwing', skill: TIER_SKILLS[0][4], upgradeLevel: 0 },
    ],
    unlocks: 'canopy',
  },
  {
    id: 'canopy',
    worldId: 'forest',
    name: 'Canopy Cup',
    tier: 2,
    blurb: 'Glow groves at dusk and the deep roots. The woods start to close in.',
    trackIds: ['timberton', 'glowmere', 'lanternfair', 'deeproot'],
    rivals: [
      { id: 'corwin', name: 'Corwin Vale', racerId: 'scarab', skill: TIER_SKILLS[1][0], upgradeLevel: 0 },
      { id: 'linnea', name: 'Linnea Rook', racerId: 'scarab', skill: TIER_SKILLS[1][1], upgradeLevel: 0 },
      { id: 'hask', name: 'Hask Briarwood', racerId: 'scarab', skill: TIER_SKILLS[1][2], upgradeLevel: 0 },
      { id: 'sorrel', name: 'Sorrel Quist', racerId: 'scarab', skill: TIER_SKILLS[1][3], upgradeLevel: 0 },
      { id: 'garret', name: 'Garret Lowe', racerId: 'scarab', skill: TIER_SKILLS[1][4], upgradeLevel: 0 },
    ],
    unlocks: 'eldercrown',
  },
  {
    id: 'eldercrown',
    worldId: 'forest',
    name: 'Elder Crown',
    tier: 3,
    blurb: 'Three ways through every stretch, falling giants and the thunder of the falls.',
    trackIds: ['glowmere', 'lanternfair', 'deeproot', 'thunderfall'],
    rivals: [
      { id: 'ysolde', name: 'Ysolde Marrick', racerId: 'sirocco', skill: TIER_SKILLS[2][0], upgradeLevel: 0 },
      { id: 'thane', name: 'Thane Oakhart', racerId: 'sirocco', skill: TIER_SKILLS[2][1], upgradeLevel: 0 },
      { id: 'elska', name: 'Elska Venn', racerId: 'sirocco', skill: TIER_SKILLS[2][2], upgradeLevel: 0 },
      { id: 'cade', name: 'Cade Windrow', racerId: 'sirocco', skill: TIER_SKILLS[2][3], upgradeLevel: 0 },
      { id: 'mireille', name: 'Mireille Dusk', racerId: 'sirocco', skill: TIER_SKILLS[2][4], upgradeLevel: 0 },
    ],
    unlocks: null,
  },
];
