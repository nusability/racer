import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';
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

export const TRACKS: TrackDef[] = [sunpan, rattlesnake, oasis, bonecanyon, glasssea, devilsteeth, mirageh, stormfront, coralcove, lagoonloop, boardwalk, seastacks, tidalcaves, volcanoisle];

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
};

export function trackById(id: string): TrackDef {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown track id "${id}"`);
  return t;
}

export function sceneryById(id: string): TrackScenery {
  const s = SCENERY[id];
  if (!s) throw new Error(`No scenery for track id "${id}"`);
  return s;
}
