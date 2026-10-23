// The championship ladder: three cups of four races, each with a fixed rival roster so the
// standings tell a story (the same five names chase you all cup). Rivals get tougher per cup.
//
// Every field is tight: five rivals in a narrow skill band, on machines matching what the
// player can plausibly have when they reach that cup, so the race is decided on the track
// and a casual pilot can win the first cup on the stock Dustwing. Assumed player machines
// (from the payouts in data/economy.ts):
// - Dust Cup: stock Dustwing (nothing earned yet).
// - Canyon Cup: Dustwing with engine 2, thrusters 2, steering 1 (~4,100 of the ~5,000-6,000
//   a Dust Cup win pays).
// - Mirage GP: Quadra Vex with engine 2, thrusters 2, steering 2 (~16,000 of the ~18,000 a
//   Canyon Cup win pays).
// tools/sim-check.ts races these assumptions against each cup.

export interface RivalDef {
  /** Stable id: standings points are keyed by it. */
  id: string;
  /** Pilot name shown in results and standings. */
  name: string;
  racerId: string;
  /** AI skill 0..1. */
  skill: number;
  /** Applied to all five upgrade tracks. */
  upgradeLevel: number;
}

export interface CupDef {
  id: string;
  name: string;
  /** 1-based tier: drives payouts and the quick-race field. */
  tier: number;
  blurb: string;
  trackIds: string[];
  /** Exactly five; ordered strongest first (front of the race-1 grid), all close together. */
  rivals: RivalDef[];
  /** Cup unlocked by winning this one, or null for the final cup. */
  unlocks: string | null;
}

/** Championship points by finishing place (1st..6th). */
export const CUP_POINTS: number[] = [10, 8, 6, 4, 2, 1];

/** The id the player's entrant uses in every race and in standings. */
export const PLAYER_ENTRANT_ID = 'player';

export const CUPS: CupDef[] = [
  {
    id: 'dust',
    name: 'Dust Cup',
    tier: 1,
    blurb: 'Salt pans and switchbacks. Prove you can hold a line at speed.',
    trackIds: ['sunpan', 'rattlesnake', 'oasis', 'bonecanyon'],
    rivals: [
      { id: 'rasha', name: 'Rasha Dunmore', racerId: 'dustwing', skill: 0.48, upgradeLevel: 0 },
      { id: 'kesh', name: 'Kesh Varo', racerId: 'scarab', skill: 0.45, upgradeLevel: 0 },
      { id: 'imra', name: 'Imra Sol', racerId: 'dustwing', skill: 0.42, upgradeLevel: 0 },
      { id: 'barrow', name: 'Barrow Quill', racerId: 'scarab', skill: 0.39, upgradeLevel: 0 },
      { id: 'tamsin', name: 'Tamsin Hale', racerId: 'dustwing', skill: 0.36, upgradeLevel: 0 },
    ],
    unlocks: 'canyon',
  },
  {
    id: 'canyon',
    name: 'Canyon Cup',
    tier: 2,
    blurb: 'Tight rock, long drops. The walls start to bite.',
    trackIds: ['oasis', 'bonecanyon', 'glasssea', 'devilsteeth'],
    rivals: [
      { id: 'vey', name: 'Vey Kadir', racerId: 'dustwing', skill: 0.68, upgradeLevel: 2 },
      { id: 'oren', name: 'Oren Sirr', racerId: 'scarab', skill: 0.66, upgradeLevel: 2 },
      { id: 'nyx', name: 'Nyx Ashgrove', racerId: 'dustwing', skill: 0.63, upgradeLevel: 2 },
      { id: 'dax', name: 'Dax Marrow', racerId: 'scarab', skill: 0.61, upgradeLevel: 1 },
      { id: 'pell', name: 'Pell Ostrava', racerId: 'dustwing', skill: 0.58, upgradeLevel: 1 },
    ],
    unlocks: 'mirage',
  },
  {
    id: 'mirage',
    name: 'Mirage Grand Prix',
    tier: 3,
    blurb: 'The fastest pilots alive, on tracks that want you dead.',
    trackIds: ['glasssea', 'devilsteeth', 'mirageh', 'stormfront'],
    rivals: [
      { id: 'zahra', name: 'Zahra Khemet', racerId: 'viper', skill: 0.85, upgradeLevel: 0 },
      { id: 'sable', name: 'Sable Rook', racerId: 'quadra', skill: 0.83, upgradeLevel: 2 },
      { id: 'ash', name: 'Ash Vantor', racerId: 'sirocco', skill: 0.8, upgradeLevel: 2 },
      { id: 'lio', name: 'Lio Scorch', racerId: 'quadra', skill: 0.78, upgradeLevel: 1 },
      { id: 'merrin', name: 'Merrin Tal', racerId: 'sirocco', skill: 0.75, upgradeLevel: 1 },
    ],
    unlocks: null,
  },
];

export function cupById(id: string): CupDef {
  const c = CUPS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown cup id "${id}"`);
  return c;
}

export function cupByTier(tier: number): CupDef {
  const c = CUPS.find((x) => x.tier === tier);
  if (!c) throw new Error(`No cup at tier ${tier}`);
  return c;
}
