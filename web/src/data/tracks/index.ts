// Every track and its scenery.
//
// Authoring a layout with character (track-check prints each track's "layout character" against
// the targets in tools/layout-character.ts; they are info for now, rules later):
// - Corners: a bend's radius is what it costs. A stock starter flat out holds ~55 m unboosted and
//   ~86 m on boost; a 300 m bend is flat out for everyone. Under 70 m is a hairpin: allowed down
//   to 40 m where the inside is walled or narrow (track-check says how much).
// - Chicanes: chicane(from, to, at, length, offset) in tracks/authoring.ts gives the control
//   points for a flick off a straight and back; splice them between the two points.
// - Elevation: give heights as a profile over the control points, withProfile(points,
//   [[param, y], ...]) in tracks/authoring.ts, instead of point by point. Vertical curve is grip:
//   over a crest the craft goes light (speed²·curvature against 83 m/s² of gravity and suction)
//   and slides wide in a bend, a dip presses it on. 'dunes' make rollers; a crest a little before
//   a bend is the brake-or-slide moment; past a crest's lift-off speed the craft flies.
// - Below the course: `floor` (ground, water or void) is what a fall off an open edge meets.
import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';
import { registerDevTrackWorld } from '../worlds.ts';
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
import { ringdeck, ringdeckScenery } from './ringdeck.ts';
import { dockyard, dockyardScenery } from './dockyard.ts';
import { hollowrock, hollowrockScenery } from './hollowrock.ts';
import { craterline, craterlineScenery } from './craterline.ts';
import { sunfield, sunfieldScenery } from './sunfield.ts';
import { cloudtop, cloudtopScenery } from './cloudtop.ts';

export const TRACKS: TrackDef[] = [sunpan, rattlesnake, oasis, bonecanyon, glasssea, devilsteeth, mirageh, stormfront, coralcove, lagoonloop, boardwalk, seastacks, tidalcaves, volcanoisle, snowfield, frozenharbor, glacier, icefalls, avalanche, auroracrown, downtown, harborbridge, neonspiral, undercity, skyway, zenithtower, ringdeck, dockyard, hollowrock, craterline, sunfield, cloudtop];

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
  ringdeck: ringdeckScenery,
  dockyard: dockyardScenery,
  hollowrock: hollowrockScenery,
  craterline: craterlineScenery,
  sunfield: sunfieldScenery,
  cloudtop: cloudtopScenery,
};

/**
 * Synthetic tracks a dev build can race by URL (main.ts, `?devtrack=`): found by id like the
 * real ones, never listed in a world. Empty in a production build.
 */
const DEV_TRACKS = new Map<string, { def: TrackDef; scenery: TrackScenery }>();

/** Dev tracks only (ui/devTracks.ts): makes a synthetic track raceable, in `worldId`'s cups and pay, drawn as its scenery's biome. */
export function registerDevTrack(def: TrackDef, scenery: TrackScenery, worldId: string): void {
  if (TRACKS.some((t) => t.id === def.id)) throw new Error(`Dev track "${def.id}" would shadow a real track`);
  // The level viewer registers every dev track up front; loading one again changes nothing.
  if (DEV_TRACKS.has(def.id)) return;
  DEV_TRACKS.set(def.id, { def, scenery });
  registerDevTrackWorld(def.id, worldId, scenery.biome);
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
