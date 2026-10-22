// Set A landmarks: machines and spectacle. One file per landmark under ./a/.

import type { LandmarkFactory } from './types.ts';
import { createInvasion } from './a/invasion.ts';
import { createMine } from './a/mine.ts';
import { createSandbeast } from './a/sandbeast.ts';
import { createSkyfleet } from './a/skyfleet.ts';
import { createSpaceport } from './a/spaceport.ts';
import { createStormwall } from './a/stormwall.ts';
import { createWreck } from './a/wreck.ts';

type SetAKind = 'spaceport' | 'invasion' | 'wreck' | 'skyfleet' | 'mine' | 'stormwall' | 'sandbeast';

export const LANDMARKS_A: Record<SetAKind, LandmarkFactory> = {
  spaceport: createSpaceport,
  invasion: createInvasion,
  wreck: createWreck,
  skyfleet: createSkyfleet,
  mine: createMine,
  stormwall: createStormwall,
  sandbeast: createSandbeast,
};
