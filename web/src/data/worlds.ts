// Worlds: each is a biome with its own tracks and three cups (rookie, pro, elite). Worlds add
// variety; cups inside a world add difficulty, so a new world's rookie cup is about as hard as
// the desert's. Winning a world's rookie cup opens the next world.

export type BiomeId = 'desert' | 'beach' | 'ice' | 'jungle' | 'city' | 'space';

export interface WorldDef {
  id: string;
  name: string;
  /** One line for the world card. */
  blurb: string;
  biome: BiomeId;
  /** Display order in quick race and the world screen; every id exists in TRACKS. */
  trackIds: string[];
  /** Exactly three, easiest first: rookie, pro, elite. Every id exists in CUPS. */
  cupIds: [string, string, string];
  /** Cup whose win opens this world, or null when open from the start. */
  unlockedBy: string | null;
  /** Card colours for menus, top → bottom. */
  card: { from: number; to: number };
}

export const WORLDS: WorldDef[] = [
  {
    id: 'desert',
    name: 'Mirage Desert',
    blurb: 'Salt pans, canyons and a spaceport on the edge of nowhere.',
    biome: 'desert',
    trackIds: ['sunpan', 'rattlesnake', 'oasis', 'bonecanyon', 'glasssea', 'devilsteeth', 'mirageh', 'stormfront'],
    cupIds: ['dust', 'canyon', 'mirage'],
    unlockedBy: null,
    card: { from: 0xf2a23a, to: 0x7a2e12 },
  },
  {
    id: 'beach',
    name: 'Coral Coast',
    blurb: 'Skim the surf, thread sea stacks and race the boardwalk at sunset.',
    biome: 'beach',
    trackIds: ['coralcove', 'lagoonloop', 'boardwalk', 'seastacks', 'tidalcaves', 'volcanoisle'],
    cupIds: ['shoreline', 'reef', 'tsunami'],
    unlockedBy: 'dust',
    card: { from: 0x4fd6e0, to: 0x125a8a },
  },
  {
    id: 'ice',
    name: 'Frostline',
    blurb: 'Glacier canyons, frozen harbours and avalanches that do not wait for you.',
    biome: 'ice',
    trackIds: ['snowfield', 'frozenharbor', 'glacier', 'icefalls', 'avalanche', 'auroracrown'],
    cupIds: ['frost', 'blizzard', 'aurora'],
    unlockedBy: 'shoreline',
    card: { from: 0xcdeeff, to: 0x2b4a8a },
  },
  {
    id: 'city',
    name: 'Neon Meridian',
    blurb: 'Loops between the towers, corkscrews over the avenues and a maglev that never brakes.',
    biome: 'city',
    trackIds: ['downtown', 'harborbridge', 'neonspiral', 'undercity', 'skyway', 'zenithtower'],
    cupIds: ['neon', 'skyline', 'zenith'],
    unlockedBy: 'frost',
    card: { from: 0xff2fb4, to: 0x2a1060 },
  },
];

export function worldById(id: string): WorldDef {
  const w = WORLDS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown world id "${id}"`);
  return w;
}

/** Dev tracks only: the world each synthetic track (data/tracks/index.ts registerDevTrack) races in. */
const DEV_TRACK_WORLDS = new Map<string, WorldDef>();

/**
 * A synthetic track races in `worldId`'s cups and pay but is drawn as `biome`: a look-dev track
 * judges a new world's look on one course before that world (its cups, its place in the
 * unlock chain) exists. Never in WORLDS, so no world screen, cup or quick-race list shows it.
 */
export function registerDevTrackWorld(trackId: string, worldId: string, biome: BiomeId): void {
  DEV_TRACK_WORLDS.set(trackId, { ...worldById(worldId), biome });
}

export function worldOfTrack(trackId: string): WorldDef {
  const w = WORLDS.find((x) => x.trackIds.includes(trackId)) ?? DEV_TRACK_WORLDS.get(trackId);
  if (!w) throw new Error(`Track "${trackId}" belongs to no world`);
  return w;
}
