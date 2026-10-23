// The landmark registry: every kind maps to exactly one factory.

import type { LandmarkFactory, LandmarkKind } from './types.ts';
import { LANDMARKS_A } from './setA.ts';
import { LANDMARKS_B } from './setB.ts';
import { LANDMARKS_C } from './setC.ts';

export const LANDMARKS: Record<LandmarkKind, LandmarkFactory> = { ...LANDMARKS_A, ...LANDMARKS_B, ...LANDMARKS_C };

export type { Landmark, LandmarkFactory, LandmarkKind, LandmarkOptions } from './types.ts';
