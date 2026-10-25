// Set F landmarks: the space world, Orbital Reach. Each kind lives in its own module under ./f/.

import type { LandmarkFactory } from './types.ts';
import { createBlastDoor } from './f/blastDoor.ts';
import { createCargoHoist } from './f/cargoHoist.ts';
import { createDockingArm } from './f/dockingArm.ts';
import { createDriftRock } from './f/driftRock.ts';
import { createVentStack } from './f/ventStack.ts';

type SetFKind = 'dockingArm' | 'cargoHoist' | 'blastDoor' | 'ventStack' | 'driftRock';

export const LANDMARKS_F: Record<SetFKind, LandmarkFactory> = {
  dockingArm: createDockingArm,
  cargoHoist: createCargoHoist,
  blastDoor: createBlastDoor,
  ventStack: createVentStack,
  driftRock: createDriftRock,
};
