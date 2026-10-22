// The championship ladder: three cups of four races, each with a fixed rival roster so the
// standings tell a story (the same five names chase you all cup). Rivals get tougher per cup.

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
  /**
   * Exactly five; ordered strongest first (front of the race-1 grid). Each cup has one clear
   * front-runner and a tail of beatable rivals, so a struggling player still scores points.
   */
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
      { id: 'rasha', name: 'Rasha Dunmore', racerId: 'sirocco', skill: 0.45, upgradeLevel: 1 },
      { id: 'kesh', name: 'Kesh Varo', racerId: 'scarab', skill: 0.34, upgradeLevel: 0 },
      { id: 'imra', name: 'Imra Sol', racerId: 'dustwing', skill: 0.28, upgradeLevel: 0 },
      { id: 'barrow', name: 'Barrow Quill', racerId: 'scarab', skill: 0.24, upgradeLevel: 0 },
      { id: 'tamsin', name: 'Tamsin Hale', racerId: 'dustwing', skill: 0.2, upgradeLevel: 0 },
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
      { id: 'vey', name: 'Vey Kadir', racerId: 'viper', skill: 0.65, upgradeLevel: 3 },
      { id: 'oren', name: 'Oren Sirr', racerId: 'quadra', skill: 0.55, upgradeLevel: 2 },
      { id: 'nyx', name: 'Nyx Ashgrove', racerId: 'sirocco', skill: 0.49, upgradeLevel: 1 },
      { id: 'dax', name: 'Dax Marrow', racerId: 'quadra', skill: 0.44, upgradeLevel: 1 },
      { id: 'pell', name: 'Pell Ostrava', racerId: 'scarab', skill: 0.4, upgradeLevel: 1 },
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
      { id: 'zahra', name: 'Zahra Khemet', racerId: 'halo', skill: 0.95, upgradeLevel: 5 },
      { id: 'sable', name: 'Sable Rook', racerId: 'viper', skill: 0.88, upgradeLevel: 5 },
      { id: 'ash', name: 'Ash Vantor', racerId: 'halo', skill: 0.82, upgradeLevel: 4 },
      { id: 'lio', name: 'Lio Scorch', racerId: 'viper', skill: 0.76, upgradeLevel: 4 },
      { id: 'merrin', name: 'Merrin Tal', racerId: 'quadra', skill: 0.7, upgradeLevel: 3 },
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
