// Set C landmarks: the coast. Each kind lives in its own module under ./c/.

import type { LandmarkFactory } from './types.ts';
import { createLighthouse } from './c/lighthouse.ts';
import { createPier } from './c/pier.ts';
import { createCruiseliner } from './c/cruiseliner.ts';
import { createRegatta } from './c/regatta.ts';
import { createResort } from './c/resort.ts';
import { createHarbor } from './c/harbor.ts';
import { createVolcano } from './c/volcano.ts';
import { createWhales } from './c/whales.ts';
import { createBeachParty } from './c/beachParty.ts';
import { createAirshow } from './c/airshow.ts';

type SetCKind = 'lighthouse' | 'pier' | 'cruiseliner' | 'regatta' | 'resort' | 'harbor' | 'volcano' | 'whales' | 'beachParty' | 'airshow';

export const LANDMARKS_C: Record<SetCKind, LandmarkFactory> = {
  lighthouse: createLighthouse,
  pier: createPier,
  cruiseliner: createCruiseliner,
  regatta: createRegatta,
  resort: createResort,
  harbor: createHarbor,
  volcano: createVolcano,
  whales: createWhales,
  beachParty: createBeachParty,
  airshow: createAirshow,
};
