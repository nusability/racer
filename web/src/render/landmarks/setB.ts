// Set B landmarks: people and places. Each kind lives in its own module under ./b/.

import type { LandmarkFactory } from './types.ts';
import { createBazaar } from './b/bazaar.ts';
import { createFair } from './b/fair.ts';
import { createGrandstand } from './b/grandstand.ts';
import { createOasisTown } from './b/oasisTown.ts';
import { createCliffVillage } from './b/cliffVillage.ts';
import { createColossus } from './b/colossus.ts';
import { createWindfarm } from './b/windfarm.ts';
import { createBalloons } from './b/balloons.ts';

type SetBKind = 'bazaar' | 'fair' | 'grandstand' | 'oasisTown' | 'cliffVillage' | 'colossus' | 'windfarm' | 'balloons';

export const LANDMARKS_B: Record<SetBKind, LandmarkFactory> = {
  bazaar: createBazaar,
  fair: createFair,
  grandstand: createGrandstand,
  oasisTown: createOasisTown,
  cliffVillage: createCliffVillage,
  colossus: createColossus,
  windfarm: createWindfarm,
  balloons: createBalloons,
};
