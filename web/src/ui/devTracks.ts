// Reached through the debug menu (main.ts `?devtrack=<id>`, the level viewer), live builds too: synthetic
// courses made raceable in the browser. The headless sim check's sprint drives a new race
// mechanic end to end before any real track uses it; a look-dev track judges a new world's look
// on one course before the world is built. Loaded by a dynamic import, so a normal start never pays for it.
import { registerDevTrack } from '../data/tracks/index.ts';
import type { TrackScenery } from '../data/tracks/scenery.ts';
import type { TrackDef } from '../core/types.ts';
import { simSprint, simWideJump } from '../../tools/sim-test-track.ts';

/** Plain desert dressing: nothing on the course a landmark could hide or a hazard bind to. */
const DEV_SCENERY: TrackScenery = {
  biome: 'desert',
  mesas: 6,
  spires: 4,
  duneHeight: 3,
  scatter: 'rocks',
  scatterPerKm: 6,
  boundary: 'dune',
  oases: [],
  landmarks: [],
};

interface DevCourse {
  def: TrackDef;
  scenery: TrackScenery;
  /** The world whose cups and pay it borrows (open from the start, so a fresh dev career can race it); it is drawn as its scenery's biome. */
  worldId: string;
  /** A would-be real course (look-dev): track-check holds it to a real track's rules. */
  lookDev: boolean;
}

/** Synthetic tracks by id. */
const DEV_COURSES: Record<string, DevCourse> = {
  [simSprint.id]: { def: simSprint, scenery: DEV_SCENERY, worldId: 'desert', lookDev: false },
  [simWideJump.id]: { def: simWideJump, scenery: DEV_SCENERY, worldId: 'desert', lookDev: false },
};

/** Every dev track, for the level viewer's picker and the debug menu. */
export const DEV_TRACKS: { id: string; name: string; lookDev: boolean }[] = Object.values(DEV_COURSES).map((c) => ({ id: c.def.id, name: c.def.name, lookDev: c.lookDev }));

/** Registers the dev track `id` and returns the world it races in, or throws naming the ones there are. */
export function loadDevTrack(id: string): string {
  const course = DEV_COURSES[id];
  if (!course) throw new Error(`devtrack: no synthetic track "${id}" (have ${Object.keys(DEV_COURSES).join(', ')})`);
  registerDevTrack(course.def, course.scenery, course.worldId);
  return course.worldId;
}
