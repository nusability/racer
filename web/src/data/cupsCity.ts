// Neon Meridian's three cups (rookie, pro, elite). Same strength bands per tier as every other
// world: worlds add variety, cups add difficulty. championships.ts adds these to CUPS.
import type { CupDef } from './championships.ts';
import { TIER_SKILLS } from './rivalSkills.ts';

export const CUPS_CITY: CupDef[] = [
  {
    id: 'neon',
    worldId: 'city',
    name: 'Neon Cup',
    tier: 1,
    blurb: 'Downtown loops and the harbour bridge. Keep it pinned upside down.',
    trackIds: ['downtown', 'harborbridge', 'neonspiral', 'undercity'],
    rivals: [
      { id: 'kenji', name: 'Kenji Arclight', racerId: 'dustwing', skill: TIER_SKILLS[0][0], upgradeLevel: 0 },
      { id: 'lux', name: 'Lux Moreno', racerId: 'dustwing', skill: TIER_SKILLS[0][1], upgradeLevel: 0 },
      { id: 'dara', name: 'Dara Voltaire', racerId: 'dustwing', skill: TIER_SKILLS[0][2], upgradeLevel: 0 },
      { id: 'milo', name: 'Milo Crane', racerId: 'dustwing', skill: TIER_SKILLS[0][3], upgradeLevel: 0 },
      { id: 'yara', name: 'Yara Glint', racerId: 'dustwing', skill: TIER_SKILLS[0][4], upgradeLevel: 0 },
    ],
    unlocks: 'skyline',
  },
  {
    id: 'skyline',
    worldId: 'city',
    name: 'Skyline Cup',
    tier: 2,
    blurb: 'Spiral ramps, the undercity bore and the skyway edge. No barrier saves you up there.',
    trackIds: ['harborbridge', 'neonspiral', 'undercity', 'skyway'],
    rivals: [
      { id: 'roux', name: 'Roux Halberd', racerId: 'scarab', skill: TIER_SKILLS[1][0], upgradeLevel: 0 },
      { id: 'zane', name: 'Zane Okafor', racerId: 'scarab', skill: TIER_SKILLS[1][1], upgradeLevel: 0 },
      { id: 'iris', name: 'Iris Neonfield', racerId: 'scarab', skill: TIER_SKILLS[1][2], upgradeLevel: 0 },
      { id: 'cato', name: 'Cato Reyes', racerId: 'scarab', skill: TIER_SKILLS[1][3], upgradeLevel: 0 },
      { id: 'suki', name: 'Suki Ferro', racerId: 'scarab', skill: TIER_SKILLS[1][4], upgradeLevel: 0 },
    ],
    unlocks: 'zenith',
  },
  {
    id: 'zenith',
    worldId: 'city',
    name: 'Zenith Crown',
    tier: 3,
    blurb: 'Double loops round the tallest tower in the city, raced at midnight by the best alive.',
    trackIds: ['neonspiral', 'undercity', 'skyway', 'zenithtower'],
    rivals: [
      { id: 'vanta', name: 'Vanta Kade', racerId: 'sirocco', skill: TIER_SKILLS[2][0], upgradeLevel: 0 },
      { id: 'orion', name: 'Orion Steel', racerId: 'sirocco', skill: TIER_SKILLS[2][1], upgradeLevel: 0 },
      { id: 'nova', name: 'Nova Sato', racerId: 'sirocco', skill: TIER_SKILLS[2][2], upgradeLevel: 0 },
      { id: 'jett', name: 'Jett Marlowe', racerId: 'sirocco', skill: TIER_SKILLS[2][3], upgradeLevel: 0 },
      { id: 'cyra', name: 'Cyra Lumen', racerId: 'sirocco', skill: TIER_SKILLS[2][4], upgradeLevel: 0 },
    ],
    unlocks: null,
  },
];
