// Dev builds only (main.ts, `?devtrack=<id>`): the synthetic courses of the headless sim check
// made raceable in the browser, so a new race mechanic (a sprint, a fork) can be driven end to
// end before any real track uses it. Loaded by a dynamic import that a production build drops.
import { registerDevTrack } from '../data/tracks/index.ts';
import type { TrackScenery } from '../data/tracks/scenery.ts';
import { simSprint } from '../../tools/sim-test-track.ts';

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

/** Synthetic tracks by id, each with its scenery and the world whose cups, pay and look it borrows. */
const DEV_COURSES = {
  [simSprint.id]: { def: simSprint, scenery: DEV_SCENERY, worldId: 'desert' },
};

/** Registers the dev track `id` and returns it, or throws naming the ones there are. */
export function loadDevTrack(id: string): string {
  const course = DEV_COURSES[id];
  if (!course) throw new Error(`devtrack: no synthetic track "${id}" (have ${Object.keys(DEV_COURSES).join(', ')})`);
  registerDevTrack(course.def, course.scenery, course.worldId);
  return course.worldId;
}
