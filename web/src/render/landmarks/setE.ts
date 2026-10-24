// Set E landmarks: the city world, Neon Meridian. Each kind lives in its own module under ./e/.

import type { LandmarkFactory } from './types.ts';
import { createSkyscrapers } from './e/skyscrapers.ts';
import { createMaglev } from './e/maglev.ts';
import { createCrane } from './e/crane.ts';
import { createDemolition } from './e/demolition.ts';
import { createCargoAirship } from './e/cargoAirship.ts';
import { createStadium } from './e/stadium.ts';
import { createHologramDragon } from './e/hologramDragon.ts';
import { createSuspensionBridge } from './e/suspensionBridge.ts';
import { createSkyTram } from './e/skyTram.ts';
import { createNeonBillboards } from './e/neonBillboards.ts';

type SetEKind = 'maglev' | 'crane' | 'demolition' | 'cargoAirship' | 'skyscrapers' | 'neonBillboards' | 'stadium' | 'hologramDragon' | 'suspensionBridge' | 'skyTram';

export const LANDMARKS_E: Record<SetEKind, LandmarkFactory> = {
  maglev: createMaglev,
  crane: createCrane,
  demolition: createDemolition,
  cargoAirship: createCargoAirship,
  skyscrapers: createSkyscrapers,
  neonBillboards: createNeonBillboards,
  stadium: createStadium,
  hologramDragon: createHologramDragon,
  suspensionBridge: createSuspensionBridge,
  skyTram: createSkyTram,
};
