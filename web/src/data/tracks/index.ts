import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';
import { registerDevTrackWorld, worldOfTrack, type BiomeId } from '../worlds.ts';
import { sunpan, sunpanScenery } from './sunpan.ts';
import { rattlesnake, rattlesnakeScenery } from './rattlesnake.ts';
import { oasis, oasisScenery } from './oasis.ts';
import { bonecanyon, bonecanyonScenery } from './bonecanyon.ts';
import { glasssea, glassseaScenery } from './glasssea.ts';
import { devilsteeth, devilsteethScenery } from './devilsteeth.ts';
import { mirageh, miragehScenery } from './mirageh.ts';
import { stormfront, stormfrontScenery } from './stormfront.ts';
import { coralcove, coralcoveScenery } from './coralcove.ts';
import { lagoonloop, lagoonloopScenery } from './lagoonloop.ts';
import { boardwalk, boardwalkScenery } from './boardwalk.ts';
import { seastacks, seastacksScenery } from './seastacks.ts';
import { tidalcaves, tidalcavesScenery } from './tidalcaves.ts';
import { volcanoisle, volcanoisleScenery } from './volcanoisle.ts';
import { snowfield, snowfieldScenery } from './snowfield.ts';
import { frozenharbor, frozenharborScenery } from './frozenharbor.ts';
import { glacier, glacierScenery } from './glacier.ts';
import { icefalls, icefallsScenery } from './icefalls.ts';
import { avalanche, avalancheScenery } from './avalanche.ts';
import { auroracrown, auroracrownScenery } from './auroracrown.ts';
import { downtown, downtownScenery } from './downtown.ts';
import { harborbridge, harborbridgeScenery } from './harborbridge.ts';
import { neonspiral, neonspiralScenery } from './neonspiral.ts';
import { undercity, undercityScenery } from './undercity.ts';
import { skyway, skywayScenery } from './skyway.ts';
import { zenithtower, zenithtowerScenery } from './zenithtower.ts';
import { mossway, mosswayScenery } from './mossway.ts';
import { timberton, timbertonScenery } from './timberton.ts';
import { glowmere, glowmereScenery } from './glowmere.ts';
import { lanternfair, lanternfairScenery } from './lanternfair.ts';
import { deeproot, deeprootScenery } from './deeproot.ts';
import { thunderfall, thunderfallScenery } from './thunderfall.ts';

export const TRACKS: TrackDef[] = [sunpan, rattlesnake, oasis, bonecanyon, glasssea, devilsteeth, mirageh, stormfront, coralcove, lagoonloop, boardwalk, seastacks, tidalcaves, volcanoisle, snowfield, frozenharbor, glacier, icefalls, avalanche, auroracrown, downtown, harborbridge, neonspiral, undercity, skyway, zenithtower, mossway, timberton, glowmere, lanternfair, deeproot, thunderfall];

const SCENERY: Record<string, TrackScenery> = {
  sunpan: sunpanScenery,
  rattlesnake: rattlesnakeScenery,
  oasis: oasisScenery,
  bonecanyon: bonecanyonScenery,
  glasssea: glassseaScenery,
  devilsteeth: devilsteethScenery,
  mirageh: miragehScenery,
  stormfront: stormfrontScenery,
  coralcove: coralcoveScenery,
  lagoonloop: lagoonloopScenery,
  boardwalk: boardwalkScenery,
  seastacks: seastacksScenery,
  tidalcaves: tidalcavesScenery,
  volcanoisle: volcanoisleScenery,
  snowfield: snowfieldScenery,
  frozenharbor: frozenharborScenery,
  glacier: glacierScenery,
  icefalls: icefallsScenery,
  avalanche: avalancheScenery,
  auroracrown: auroracrownScenery,
  downtown: downtownScenery,
  harborbridge: harborbridgeScenery,
  neonspiral: neonspiralScenery,
  undercity: undercityScenery,
  skyway: skywayScenery,
  zenithtower: zenithtowerScenery,
  mossway: mosswayScenery,
  timberton: timbertonScenery,
  glowmere: glowmereScenery,
  lanternfair: lanternfairScenery,
  deeproot: deeprootScenery,
  thunderfall: thunderfallScenery,
};

/**
 * Synthetic tracks a dev build can race by URL (main.ts, `?devtrack=`): found by id like the
 * real ones, never listed in a world. Empty in a production build.
 */
const DEV_TRACKS = new Map<string, { def: TrackDef; scenery: TrackScenery }>();

/** Dev builds only: makes a synthetic track raceable, in `worldId`'s cups and pay and its own scenery's look. */
export function registerDevTrack(def: TrackDef, scenery: TrackScenery, worldId: string): void {
  if (TRACKS.some((t) => t.id === def.id)) throw new Error(`Dev track "${def.id}" would shadow a real track`);
  DEV_TRACKS.set(def.id, { def, scenery });
  registerDevTrackWorld(def.id, worldId);
}

export function trackById(id: string): TrackDef {
  const t = TRACKS.find((x) => x.id === id) ?? DEV_TRACKS.get(id)?.def;
  if (!t) throw new Error(`Unknown track id "${id}"`);
  return t;
}

export function sceneryById(id: string): TrackScenery {
  const s = SCENERY[id] ?? DEV_TRACKS.get(id)?.scenery;
  if (!s) throw new Error(`No scenery for track id "${id}"`);
  return s;
}

/**
 * The biome a track is drawn and heard in: its world's, or a dev track's own scenery's, so a
 * test scene that borrows another world's cups and pay (the sim's desert-dressed sprint) never
 * borrows its look.
 */
export function biomeOfTrack(id: string): BiomeId {
  const dev = DEV_TRACKS.get(id);
  return dev ? dev.scenery.biome : worldOfTrack(id).biome;
}
