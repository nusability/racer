// Neon Meridian's three cups (rookie, pro, elite). Same rival ladders per tier as every other
// world: worlds add variety, cups add difficulty. championships.ts adds these to CUPS.
import type { CupDef } from './championships.ts';
import { RIVAL_FORM } from './rivalSkills.ts';

export const CUPS_CITY: CupDef[] = [
  {
    id: 'neon',
    worldId: 'city',
    name: 'Neon Cup',
    tier: 1,
    blurb: 'Downtown loops and the harbour bridge. Keep it pinned upside down.',
    trackIds: ['downtown', 'harborbridge', 'neonspiral', 'undercity'],
    rivals: [
      { id: 'kenji', name: 'Kenji Arclight', racerId: 'dustwing', ...RIVAL_FORM[0][0], upgradeLevel: 0 },
      { id: 'lux', name: 'Lux Moreno', racerId: 'dustwing', ...RIVAL_FORM[0][1], upgradeLevel: 0 },
      { id: 'dara', name: 'Dara Voltaire', racerId: 'dustwing', ...RIVAL_FORM[0][2], upgradeLevel: 0 },
      { id: 'milo', name: 'Milo Crane', racerId: 'dustwing', ...RIVAL_FORM[0][3], upgradeLevel: 0 },
      { id: 'yara', name: 'Yara Glint', racerId: 'dustwing', ...RIVAL_FORM[0][4], upgradeLevel: 0 },
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
      { id: 'roux', name: 'Roux Halberd', racerId: 'scarab', ...RIVAL_FORM[1][0], upgradeLevel: 0 },
      { id: 'zane', name: 'Zane Okafor', racerId: 'scarab', ...RIVAL_FORM[1][1], upgradeLevel: 0 },
      { id: 'iris', name: 'Iris Neonfield', racerId: 'scarab', ...RIVAL_FORM[1][2], upgradeLevel: 0 },
      { id: 'cato', name: 'Cato Reyes', racerId: 'scarab', ...RIVAL_FORM[1][3], upgradeLevel: 0 },
      { id: 'suki', name: 'Suki Ferro', racerId: 'scarab', ...RIVAL_FORM[1][4], upgradeLevel: 0 },
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
      { id: 'vanta', name: 'Vanta Kade', racerId: 'sirocco', ...RIVAL_FORM[2][0], upgradeLevel: 0 },
      { id: 'orion', name: 'Orion Steel', racerId: 'sirocco', ...RIVAL_FORM[2][1], upgradeLevel: 0 },
      { id: 'nova', name: 'Nova Sato', racerId: 'sirocco', ...RIVAL_FORM[2][2], upgradeLevel: 0 },
      { id: 'jett', name: 'Jett Marlowe', racerId: 'sirocco', ...RIVAL_FORM[2][3], upgradeLevel: 0 },
      { id: 'cyra', name: 'Cyra Lumen', racerId: 'sirocco', ...RIVAL_FORM[2][4], upgradeLevel: 0 },
    ],
    unlocks: null,
  },
];
