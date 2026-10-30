// Orbital Reach's three cups (rookie, pro, elite). Same rival ladders per tier as every other
// world: worlds add variety, cups add difficulty. championships.ts adds these to CUPS.
import type { CupDef } from './championships.ts';
import { RIVAL_FORM } from './rivalSkills.ts';

export const CUPS_SPACE: CupDef[] = [
  {
    id: 'apogee',
    worldId: 'space',
    name: 'Apogee Cup',
    tier: 1,
    blurb: 'Habitat decks, the foundry docks and the first jumps over the void. Mind the open edges.',
    trackIds: ['ringdeck', 'dockyard', 'hollowrock', 'craterline'],
    rivals: [
      { id: 'oriel', name: 'Oriel Vance', racerId: 'dustwing', ...RIVAL_FORM[0][0], upgradeLevel: 0 },
      { id: 'pax', name: 'Pax Telford', racerId: 'dustwing', ...RIVAL_FORM[0][1], upgradeLevel: 0 },
      { id: 'suna', name: 'Suna Ferrow', racerId: 'dustwing', ...RIVAL_FORM[0][2], upgradeLevel: 0 },
      { id: 'lem', name: 'Lem Aldane', racerId: 'dustwing', ...RIVAL_FORM[0][3], upgradeLevel: 0 },
      { id: 'kitra', name: 'Kitra Solis', racerId: 'dustwing', ...RIVAL_FORM[0][4], upgradeLevel: 0 },
    ],
    unlocks: 'perihelion',
  },
  {
    id: 'perihelion',
    worldId: 'space',
    name: 'Perihelion Cup',
    tier: 2,
    blurb: 'Into the hollow rock, over the craters and through the sunfield. The star is close now.',
    trackIds: ['dockyard', 'hollowrock', 'craterline', 'sunfield'],
    rivals: [
      { id: 'cassia', name: 'Cassia Wren', racerId: 'scarab', ...RIVAL_FORM[1][0], upgradeLevel: 0 },
      { id: 'dex', name: 'Dex Halloran', racerId: 'scarab', ...RIVAL_FORM[1][1], upgradeLevel: 0 },
      { id: 'ilsa', name: 'Ilsa Marrek', racerId: 'scarab', ...RIVAL_FORM[1][2], upgradeLevel: 0 },
      { id: 'tobin', name: 'Tobin Achar', racerId: 'scarab', ...RIVAL_FORM[1][3], upgradeLevel: 0 },
      { id: 'vela', name: 'Vela Onwu', racerId: 'scarab', ...RIVAL_FORM[1][4], upgradeLevel: 0 },
    ],
    unlocks: 'supernova',
  },
  {
    id: 'supernova',
    worldId: 'space',
    name: 'Supernova Trophy',
    tier: 3,
    blurb: 'The cloudtop skim and everything before it, flat out over a gas giant by the best in the reach.',
    trackIds: ['hollowrock', 'craterline', 'sunfield', 'cloudtop'],
    rivals: [
      { id: 'astra', name: 'Astra Novak', racerId: 'sirocco', ...RIVAL_FORM[2][0], upgradeLevel: 0 },
      { id: 'ren', name: 'Ren Halcyon', racerId: 'sirocco', ...RIVAL_FORM[2][1], upgradeLevel: 0 },
      { id: 'zeph', name: 'Zeph Calder', racerId: 'sirocco', ...RIVAL_FORM[2][2], upgradeLevel: 0 },
      { id: 'nyra', name: 'Nyra Vost', racerId: 'sirocco', ...RIVAL_FORM[2][3], upgradeLevel: 0 },
      { id: 'kael', name: 'Kael Strand', racerId: 'sirocco', ...RIVAL_FORM[2][4], upgradeLevel: 0 },
    ],
    unlocks: null,
  },
];
