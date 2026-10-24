// Set F landmarks: the forest world, Elderwood. Each kind lives in its own module under ./f/.

import type { LandmarkFactory } from './types.ts';
import { createFallingTree } from './f/fallingTree.ts';
import { createHerd } from './f/herd.ts';
import { createLogSlide } from './f/logSlide.ts';
import { createWindRoar } from './f/windRoar.ts';
import { createTreeVillage } from './f/treeVillage.ts';
import { createLumberTown } from './f/lumberTown.ts';
import { createWaterfall } from './f/waterfall.ts';
import { createRuins } from './f/ruins.ts';
import { createGlowGrove } from './f/glowGrove.ts';
import { createRopeBridge } from './f/ropeBridge.ts';

type SetFKind = 'fallingTree' | 'herd' | 'logSlide' | 'windRoar' | 'treeVillage' | 'lumberTown' | 'waterfall' | 'ruins' | 'glowGrove' | 'ropeBridge';

export const LANDMARKS_F: Record<SetFKind, LandmarkFactory> = {
  fallingTree: createFallingTree,
  herd: createHerd,
  logSlide: createLogSlide,
  windRoar: createWindRoar,
  treeVillage: createTreeVillage,
  lumberTown: createLumberTown,
  waterfall: createWaterfall,
  ruins: createRuins,
  glowGrove: createGlowGrove,
  ropeBridge: createRopeBridge,
};
