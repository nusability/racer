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
  /** The world (data/worlds.ts) this cup belongs to. */
  worldId: string;
  name: string;
  /** 1-based tier: drives payouts and the quick-race field. */
  tier: number;
  blurb: string;
  trackIds: string[];
  /** Exactly five; ordered strongest first (front of the race-1 grid), all close together. */
  rivals: RivalDef[];
  /** Next cup in the same world unlocked by winning this one, or null for the world's elite cup. */
  unlocks: string | null;
}

/** Championship points by finishing place (1st..6th). */
export const CUP_POINTS: number[] = [10, 8, 6, 4, 2, 1];

/** The id the player's entrant uses in every race and in standings. */
export const PLAYER_ENTRANT_ID = 'player';

export const CUPS: CupDef[] = [
  {
    id: 'dust',
    worldId: 'desert',
    name: 'Dust Cup',
    tier: 1,
    blurb: 'Salt pans and switchbacks. Prove you can hold a line at speed.',
    trackIds: ['sunpan', 'rattlesnake', 'oasis', 'bonecanyon'],
    rivals: [
      { id: 'rasha', name: 'Rasha Dunmore', racerId: 'dustwing', skill: 0.18, upgradeLevel: 0 },
      { id: 'kesh', name: 'Kesh Varo', racerId: 'scarab', skill: 0.15, upgradeLevel: 0 },
      { id: 'imra', name: 'Imra Sol', racerId: 'dustwing', skill: 0.12, upgradeLevel: 0 },
      { id: 'barrow', name: 'Barrow Quill', racerId: 'scarab', skill: 0.09, upgradeLevel: 0 },
      { id: 'tamsin', name: 'Tamsin Hale', racerId: 'dustwing', skill: 0.06, upgradeLevel: 0 },
    ],
    unlocks: 'canyon',
  },
  {
    id: 'canyon',
    worldId: 'desert',
    name: 'Canyon Cup',
    tier: 2,
    blurb: 'Tight rock, long drops. The walls start to bite.',
    trackIds: ['oasis', 'bonecanyon', 'glasssea', 'devilsteeth'],
    rivals: [
      { id: 'vey', name: 'Vey Kadir', racerId: 'dustwing', skill: 0.64, upgradeLevel: 1 },
      { id: 'oren', name: 'Oren Sirr', racerId: 'scarab', skill: 0.61, upgradeLevel: 1 },
      { id: 'nyx', name: 'Nyx Ashgrove', racerId: 'dustwing', skill: 0.58, upgradeLevel: 1 },
      { id: 'dax', name: 'Dax Marrow', racerId: 'scarab', skill: 0.55, upgradeLevel: 1 },
      { id: 'pell', name: 'Pell Ostrava', racerId: 'dustwing', skill: 0.52, upgradeLevel: 1 },
    ],
    unlocks: 'mirage',
  },
  {
    id: 'mirage',
    worldId: 'desert',
    name: 'Mirage Grand Prix',
    tier: 3,
    blurb: 'The fastest pilots alive, on tracks that want you dead.',
    trackIds: ['glasssea', 'devilsteeth', 'mirageh', 'stormfront'],
    rivals: [
      { id: 'zahra', name: 'Zahra Khemet', racerId: 'quadra', skill: 0.65, upgradeLevel: 1 },
      { id: 'sable', name: 'Sable Rook', racerId: 'sirocco', skill: 0.62, upgradeLevel: 1 },
      { id: 'ash', name: 'Ash Vantor', racerId: 'quadra', skill: 0.59, upgradeLevel: 1 },
      { id: 'lio', name: 'Lio Scorch', racerId: 'sirocco', skill: 0.56, upgradeLevel: 1 },
      { id: 'merrin', name: 'Merrin Tal', racerId: 'quadra', skill: 0.53, upgradeLevel: 1 },
    ],
    unlocks: null,
  },
  // Coral Coast: same strength bands per tier as the desert (worlds add variety, cups add
  // difficulty), so the rookie cup is as winnable as the Dust Cup.
  {
    id: 'shoreline',
    worldId: 'beach',
    name: 'Shoreline Cup',
    tier: 1,
    blurb: 'Lagoons and boardwalks. Keep it clean over the water.',
    trackIds: ['coralcove', 'lagoonloop', 'boardwalk', 'seastacks'],
    rivals: [
      { id: 'tide', name: 'Tide Okoro', racerId: 'dustwing', skill: 0.18, upgradeLevel: 0 },
      { id: 'nell', name: 'Nell Spindrift', racerId: 'scarab', skill: 0.15, upgradeLevel: 0 },
      { id: 'pip', name: 'Pip Saltmarsh', racerId: 'dustwing', skill: 0.12, upgradeLevel: 0 },
      { id: 'cove', name: 'Cove Calloway', racerId: 'scarab', skill: 0.09, upgradeLevel: 0 },
      { id: 'marin', name: 'Marin Vash', racerId: 'dustwing', skill: 0.06, upgradeLevel: 0 },
    ],
    unlocks: 'reef',
  },
  {
    id: 'reef',
    worldId: 'beach',
    name: 'Reef Cup',
    tier: 2,
    blurb: 'Sea stacks and sunken caves. The tide does not wait.',
    trackIds: ['lagoonloop', 'boardwalk', 'seastacks', 'tidalcaves'],
    rivals: [
      { id: 'juno', name: 'Juno Shoal', racerId: 'dustwing', skill: 0.64, upgradeLevel: 1 },
      { id: 'ossian', name: 'Ossian Gale', racerId: 'scarab', skill: 0.61, upgradeLevel: 1 },
      { id: 'lark', name: 'Lark Seaborne', racerId: 'dustwing', skill: 0.58, upgradeLevel: 1 },
      { id: 'teo', name: 'Teo Driftwood', racerId: 'scarab', skill: 0.55, upgradeLevel: 1 },
      { id: 'coralis', name: 'Mira Coralis', racerId: 'dustwing', skill: 0.52, upgradeLevel: 1 },
    ],
    unlocks: 'tsunami',
  },
  {
    id: 'tsunami',
    worldId: 'beach',
    name: 'Tsunami Trophy',
    tier: 3,
    blurb: 'Lava tubes and blowholes, raced flat out by the best on the coast.',
    trackIds: ['seastacks', 'tidalcaves', 'boardwalk', 'volcanoisle'],
    rivals: [
      { id: 'ishara', name: 'Ishara Wake', racerId: 'quadra', skill: 0.65, upgradeLevel: 1 },
      { id: 'rook', name: 'Rook Maelstrom', racerId: 'sirocco', skill: 0.62, upgradeLevel: 1 },
      { id: 'nerys', name: 'Nerys Squall', racerId: 'quadra', skill: 0.59, upgradeLevel: 1 },
      { id: 'dagan', name: 'Dagan Undertow', racerId: 'sirocco', skill: 0.56, upgradeLevel: 1 },
      { id: 'siren', name: 'Siren Brisk', racerId: 'quadra', skill: 0.53, upgradeLevel: 1 },
    ],
    unlocks: null,
  },
];

export function cupById(id: string): CupDef {
  const c = CUPS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown cup id "${id}"`);
  return c;
}

export function cupByTier(worldId: string, tier: number): CupDef {
  const c = CUPS.find((x) => x.worldId === worldId && x.tier === tier);
  if (!c) throw new Error(`No cup at tier ${tier} in world "${worldId}"`);
  return c;
}
