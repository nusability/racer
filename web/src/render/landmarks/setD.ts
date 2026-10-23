// Set D landmarks: the ice world, Frostline. Each kind lives in its own module under ./d/.

import type { LandmarkFactory } from './types.ts';
import { createIcebreaker } from './d/icebreaker.ts';
import { createAvalancheSlope } from './d/avalancheSlope.ts';
import { createGlacierWall } from './d/glacierWall.ts';
import { createMammothHerd } from './d/mammothHerd.ts';
import { createIceStation } from './d/iceStation.ts';
import { createSkiJump } from './d/skiJump.ts';
import { createIcePalace } from './d/icePalace.ts';
import { createFrozenFalls } from './d/frozenFalls.ts';
import { createAuroraSky } from './d/auroraSky.ts';
import { createSnowcatConvoy } from './d/snowcatConvoy.ts';

type SetDKind = 'icebreaker' | 'avalancheSlope' | 'glacierWall' | 'mammothHerd' | 'iceStation' | 'skiJump' | 'icePalace' | 'frozenFalls' | 'auroraSky' | 'snowcatConvoy';

export const LANDMARKS_D: Record<SetDKind, LandmarkFactory> = {
  icebreaker: createIcebreaker,
  avalancheSlope: createAvalancheSlope,
  glacierWall: createGlacierWall,
  mammothHerd: createMammothHerd,
  iceStation: createIceStation,
  skiJump: createSkiJump,
  icePalace: createIcePalace,
  frozenFalls: createFrozenFalls,
  auroraSky: createAuroraSky,
  snowcatConvoy: createSnowcatConvoy,
};
