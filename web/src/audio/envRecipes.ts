// What the world sounds like: a bed per biome, a looping voice per kind of landmark, and a
// voice plus warning cues per kind of hazard. Pure data; environment.ts plays it.

import type { HazardDef } from '../core/types.ts';
import type { TrackScenery } from '../data/tracks/scenery.ts';
import type { LandmarkKind } from '../render/landmarks/types.ts';
import type { CueName } from './envCues.ts';
import type { LoopRecipe } from './loopSlot.ts';

export type Biome = TrackScenery['biome'];

/** A place that makes sound: its loop, and how far it carries (metres). */
export interface SoundFamily {
  loop: LoopRecipe;
  /** Full presence inside `near`; silent beyond `far`. */
  near: number;
  far: number;
  /** Played once as the camera comes within `near` (a crowd cheering you past). */
  pass?: CueName;
}

export interface BiomeBed {
  loop: LoopRecipe;
  /** Random ambience cues and the gap between them, seconds. */
  cues: CueName[];
  gap: [number, number];
}

export const BIOME_BEDS: Record<Biome, BiomeBed> = {
  // Wind over the salt pans, and a low hum from the spaceport on the horizon that never stops.
  desert: {
    loop: {
      noise: { filter: 'bandpass', hz: 420, q: 0.9, gain: 0.5 },
      tone: { wave: 'sine', hz: 41, gain: 0.22 },
      lfo: { wave: 'sine', hz: 0.07, amp: 0.6, filterHz: 180 },
      gain: 0.35,
      wet: 0.6,
    },
    cues: ['hiss', 'rumble'],
    gap: [6, 14],
  },
  // Surf breaking in slow waves, with gulls.
  beach: {
    loop: {
      noise: { filter: 'lowpass', hz: 800, q: 0.5, gain: 0.8 },
      tone: { wave: 'sine', hz: 55, gain: 0.06 },
      lfo: { wave: 'sine', hz: 0.11, amp: 0.8, filterHz: 250 },
      gain: 0.35,
      wet: 0.4,
    },
    cues: ['gull', 'gull', 'splash'],
    gap: [3, 8],
  },
  // A howling, resonant wind and the ice groaning.
  ice: {
    loop: {
      noise: { filter: 'bandpass', hz: 700, q: 7, gain: 1.2 },
      tone: { wave: 'triangle', hz: 110, gain: 0.03 },
      lfo: { wave: 'sine', hz: 0.09, amp: 0.5, filterHz: 420 },
      // The narrow band carries little energy: this sits it level with the other beds.
      gain: 0.65,
      wet: 0.7,
    },
    cues: ['creak', 'tick', 'creak'],
    gap: [4, 10],
  },
  // Traffic humming on every street round the course, the mains hum of a lit city under it,
  // and its life: horns down a block, a siren far off, a neon tube arcing.
  city: {
    loop: {
      noise: { filter: 'lowpass', hz: 320, q: 0.6, gain: 0.8 },
      tone: { wave: 'sawtooth', hz: 50, gain: 0.05 },
      lfo: { wave: 'sine', hz: 0.06, amp: 0.35, filterHz: 120 },
      gain: 0.35,
      wet: 0.55,
    },
    cues: ['honk', 'honk', 'siren', 'buzz'],
    gap: [3, 9],
  },
  // Wind high in the leaves, swelling and falling, over the deep hush of a big wood; birds,
  // a giant creaking somewhere, and now and then a call from far off between the trunks.
  forest: {
    loop: {
      noise: { filter: 'bandpass', hz: 1900, q: 0.6, gain: 0.7 },
      tone: { wave: 'sine', hz: 62, gain: 0.05 },
      lfo: { wave: 'sine', hz: 0.12, amp: 0.6, filterHz: 700 },
      gain: 0.32,
      wet: 0.75,
    },
    cues: ['birdsong', 'birdsong', 'birdsong', 'woodcreak', 'call'],
    gap: [2, 7],
  },
};

const crowd: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 950, q: 0.8, gain: 0.8 }, lfo: { wave: 'sine', hz: 0.25, amp: 0.35 }, gain: 0.5, wet: 0.3 },
  near: 60,
  far: 420,
  pass: 'cheer',
};
const market: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 1400, q: 1.2, gain: 0.6 }, lfo: { wave: 'sine', hz: 0.4, amp: 0.5 }, gain: 0.35, wet: 0.3 },
  near: 60,
  far: 320,
};
// A four-on-the-floor kick (a decaying sawtooth swell) under a crowd.
const party: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 55, gain: 0.7 }, noise: { filter: 'bandpass', hz: 1000, q: 0.8, gain: 0.35 }, lfo: { wave: 'sawtooth', hz: 2.1, amp: -0.9 }, gain: 0.45, wet: 0.35 },
  near: 70,
  far: 450,
  pass: 'cheer',
};
const surf: SoundFamily = {
  loop: { noise: { filter: 'lowpass', hz: 900, q: 0.5, gain: 0.9 }, lfo: { wave: 'sine', hz: 0.13, amp: 0.85, filterHz: 300 }, gain: 0.4, wet: 0.35 },
  near: 80,
  far: 450,
};
const waterfall: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 1600, q: 0.4, gain: 1 }, gain: 0.45, wet: 0.5 },
  near: 80,
  far: 600,
};
const machine: SoundFamily = {
  loop: { tone: { wave: 'sawtooth', hz: 46, gain: 0.3 }, noise: { filter: 'bandpass', hz: 400, q: 2, gain: 0.6 }, lfo: { wave: 'sine', hz: 3, amp: 0.3 }, gain: 0.4, wet: 0.35 },
  near: 60,
  far: 450,
};
const rumble: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 36, gain: 0.5 }, noise: { filter: 'lowpass', hz: 110, q: 0.7, gain: 1 }, lfo: { wave: 'sine', hz: 0.15, amp: 0.4 }, gain: 0.55, wet: 0.5 },
  near: 150,
  far: 1400,
};
// Something not from here: a wavering alien drone with a narrow singing band over it.
const scifi: SoundFamily = {
  loop: { tone: { wave: 'sawtooth', hz: 73, gain: 0.22 }, noise: { filter: 'bandpass', hz: 2400, q: 6, gain: 0.35 }, lfo: { wave: 'sine', hz: 0.3, cents: 50, filterHz: 800 }, gain: 0.4, wet: 0.7 },
  near: 100,
  far: 700,
};
const wind: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 500, q: 1.3, gain: 1 }, lfo: { wave: 'sine', hz: 0.8, amp: 0.6 }, gain: 0.4, wet: 0.4 },
  near: 80,
  far: 500,
};
// A choir of sines and a high glassy band: the aurora and the ice palace.
const ethereal: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 880, gain: 0.22 }, noise: { filter: 'bandpass', hz: 5000, q: 8, gain: 0.25 }, lfo: { wave: 'sine', hz: 0.2, cents: 25, filterHz: 1500 }, gain: 0.3, wet: 0.9 },
  near: 120,
  far: 900,
};
const burners: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 700, q: 1, gain: 1 }, lfo: { wave: 'sawtooth', hz: 0.3, amp: -0.9 }, gain: 0.35, wet: 0.4 },
  near: 80,
  far: 500,
};
// Neon: the mains buzz of tubes and transformers, crackling now and then.
const neonBuzz: SoundFamily = {
  loop: { tone: { wave: 'sawtooth', hz: 120, gain: 0.14 }, noise: { filter: 'bandpass', hz: 3200, q: 5, gain: 0.25 }, lfo: { wave: 'square', hz: 0.7, amp: 0.25 }, gain: 0.3, wet: 0.3 },
  near: 50,
  far: 300,
  pass: 'buzz',
};
// A tree village: voices and the knock of work drifting down, wooden chimes turning in the wind.
const canopyVillage: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 784, gain: 0.08 }, noise: { filter: 'bandpass', hz: 1250, q: 1.1, gain: 0.5 }, lfo: { wave: 'sine', hz: 0.35, amp: 0.4, cents: 30 }, gain: 0.32, wet: 0.6 },
  near: 70,
  far: 420,
};
// A sawmill: a big blade singing through timber over its engine's chug.
const sawmill: SoundFamily = {
  loop: { tone: { wave: 'sawtooth', hz: 220, gain: 0.08 }, noise: { filter: 'bandpass', hz: 2400, q: 2.5, gain: 0.4 }, lfo: { wave: 'sawtooth', hz: 0.4, amp: -0.6, filterHz: 800 }, gain: 0.35, wet: 0.35 },
  near: 70,
  far: 450,
  pass: 'cheer',
};
// Old stones humming: a low resonant tone with a faint glassy ring over it.
const stoneHum: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 98, gain: 0.2 }, noise: { filter: 'bandpass', hz: 3200, q: 9, gain: 0.18 }, lfo: { wave: 'sine', hz: 0.1, cents: 20, filterHz: 900 }, gain: 0.3, wet: 0.85 },
  near: 80,
  far: 500,
};
// Ropes and planks working in the wind high overhead.
const ropes: SoundFamily = {
  loop: { tone: { wave: 'triangle', hz: 140, gain: 0.06 }, noise: { filter: 'bandpass', hz: 480, q: 4, gain: 0.5 }, lfo: { wave: 'triangle', hz: 0.3, amp: 0.5, filterHz: 150 }, gain: 0.3, wet: 0.6 },
  near: 80,
  far: 450,
};
// Wind in a bridge's cables: a steady sung chord.
const cables: SoundFamily = {
  loop: { tone: { wave: 'sine', hz: 220, gain: 0.12 }, noise: { filter: 'bandpass', hz: 900, q: 6, gain: 0.4 }, lfo: { wave: 'sine', hz: 0.25, cents: 15, filterHz: 200 }, gain: 0.3, wet: 0.6 },
  near: 80,
  far: 500,
};
const iceGroan: SoundFamily = {
  loop: { noise: { filter: 'bandpass', hz: 1100, q: 6, gain: 0.6 }, tone: { wave: 'sawtooth', hz: 40, gain: 0.08 }, lfo: { wave: 'triangle', hz: 0.5, filterHz: 500 }, gain: 0.35, wet: 0.6 },
  near: 80,
  far: 500,
};

// --- Hazard voices (used both for bound landmarks and for the hazard itself) -------------------

const beastGrowl: LoopRecipe = { tone: { wave: 'sawtooth', hz: 52, gain: 0.5 }, noise: { filter: 'bandpass', hz: 380, q: 3, gain: 0.7 }, lfo: { wave: 'sine', hz: 2.6, amp: 0.5, filterHz: 160 }, gain: 0.6, wet: 0.35 };
const digger: LoopRecipe = { tone: { wave: 'square', hz: 38, gain: 0.25 }, noise: { filter: 'bandpass', hz: 520, q: 4, gain: 0.8 }, lfo: { wave: 'sawtooth', hz: 5.5, amp: -0.6 }, gain: 0.55, wet: 0.3 };
const shipEngines: LoopRecipe = { tone: { wave: 'sawtooth', hz: 61, gain: 0.35 }, noise: { filter: 'lowpass', hz: 500, q: 0.7, gain: 0.7 }, lfo: { wave: 'sine', hz: 0.4, cents: 25, amp: 0.2 }, gain: 0.6, wet: 0.45 };
const gale: LoopRecipe = { noise: { filter: 'bandpass', hz: 600, q: 1.5, gain: 1.1 }, lfo: { wave: 'sine', hz: 0.9, amp: 0.7, filterHz: 300 }, gain: 0.55, wet: 0.4 };
const rotor: LoopRecipe = { tone: { wave: 'sawtooth', hz: 45, gain: 0.25 }, noise: { filter: 'lowpass', hz: 700, q: 1, gain: 0.9 }, lfo: { wave: 'sawtooth', hz: 13, amp: -0.85 }, gain: 0.6, wet: 0.3 };
const avalanche: LoopRecipe = { tone: { wave: 'sine', hz: 34, gain: 0.45 }, noise: { filter: 'lowpass', hz: 260, q: 0.7, gain: 1.1 }, lfo: { wave: 'sine', hz: 0.3, amp: 0.3 }, gain: 0.7, wet: 0.5 };
const iceCrusher: LoopRecipe = { tone: { wave: 'sawtooth', hz: 40, gain: 0.3 }, noise: { filter: 'bandpass', hz: 700, q: 2, gain: 0.7 }, lfo: { wave: 'sawtooth', hz: 3, amp: -0.5 }, gain: 0.55, wet: 0.35 };
const diesel: LoopRecipe = { tone: { wave: 'square', hz: 48, gain: 0.3 }, noise: { filter: 'bandpass', hz: 1200, q: 3, gain: 0.45 }, lfo: { wave: 'sawtooth', hz: 11, amp: -0.6 }, gain: 0.5, wet: 0.3 };
const footfalls: LoopRecipe = { tone: { wave: 'sine', hz: 42, gain: 0.8 }, noise: { filter: 'lowpass', hz: 160, q: 0.7, gain: 0.7 }, lfo: { wave: 'sawtooth', hz: 1.7, amp: -1 }, gain: 0.75, wet: 0.35 };
const strider: LoopRecipe = { tone: { wave: 'square', hz: 36, gain: 0.3 }, noise: { filter: 'bandpass', hz: 260, q: 2, gain: 0.7 }, lfo: { wave: 'sawtooth', hz: 1.2, amp: -0.9, cents: 30 }, gain: 0.65, wet: 0.5 };
const rocket: LoopRecipe = { tone: { wave: 'sawtooth', hz: 32, gain: 0.4 }, noise: { filter: 'lowpass', hz: 420, q: 0.5, gain: 1.1 }, lfo: { wave: 'sine', hz: 6, amp: 0.25 }, gain: 0.7, wet: 0.45 };
const whaleSong: LoopRecipe = { tone: { wave: 'sine', hz: 240, gain: 0.35 }, noise: { filter: 'lowpass', hz: 500, q: 0.6, gain: 0.25 }, lfo: { wave: 'sine', hz: 0.15, cents: 400 }, gain: 0.5, wet: 0.7 };
const jets: LoopRecipe = { tone: { wave: 'sawtooth', hz: 160, gain: 0.15 }, noise: { filter: 'bandpass', hz: 1800, q: 1, gain: 0.9 }, lfo: { wave: 'sine', hz: 0.5, cents: 60 }, gain: 0.55, wet: 0.4 };
// A linear motor singing up and down under the rush of the train's air.
const maglevWhine: LoopRecipe = { tone: { wave: 'sine', hz: 660, gain: 0.18 }, noise: { filter: 'bandpass', hz: 1500, q: 0.8, gain: 0.8 }, lfo: { wave: 'sine', hz: 0.35, cents: 300, filterHz: 600 }, gain: 0.55, wet: 0.35 };
// A crane's slewing motor and its winch, ratcheting.
const craneWinch: LoopRecipe = { tone: { wave: 'square', hz: 55, gain: 0.2 }, noise: { filter: 'bandpass', hz: 800, q: 3, gain: 0.6 }, lfo: { wave: 'sawtooth', hz: 7, amp: -0.5 }, gain: 0.5, wet: 0.35 };
// Demolition: compressors and the groan of a structure about to go.
const condemned: LoopRecipe = { tone: { wave: 'sawtooth', hz: 38, gain: 0.25 }, noise: { filter: 'lowpass', hz: 300, q: 1, gain: 0.8 }, lfo: { wave: 'triangle', hz: 0.4, amp: 0.4, filterHz: 150 }, gain: 0.55, wet: 0.45 };
// An airship's ducted fans: a deep throb under a broad roar of moving air.
const airshipFans: LoopRecipe = { tone: { wave: 'sawtooth', hz: 42, gain: 0.3 }, noise: { filter: 'bandpass', hz: 450, q: 0.9, gain: 1 }, lfo: { wave: 'sawtooth', hz: 6.5, amp: -0.4 }, gain: 0.6, wet: 0.45 };
// A giant under strain: a slow groaning saw through a woody band, bending as it sways.
const timberStrain: LoopRecipe = { tone: { wave: 'sawtooth', hz: 48, gain: 0.3 }, noise: { filter: 'bandpass', hz: 420, q: 4, gain: 0.5 }, lfo: { wave: 'triangle', hz: 0.35, amp: 0.5, cents: 40, filterHz: 160 }, gain: 0.5, wet: 0.55 };
// A herd moving through the woods: quick, soft hoofbeats on deep moss.
const hoofbeats: LoopRecipe = { tone: { wave: 'sine', hz: 70, gain: 0.6 }, noise: { filter: 'bandpass', hz: 700, q: 1.4, gain: 0.35 }, lfo: { wave: 'sawtooth', hz: 3.1, amp: -0.9 }, gain: 0.6, wet: 0.45 };
// Logs on the move: a low rolling rumble knocking as they turn.
const logRumble: LoopRecipe = { tone: { wave: 'sine', hz: 40, gain: 0.45 }, noise: { filter: 'lowpass', hz: 300, q: 0.8, gain: 0.9 }, lfo: { wave: 'sawtooth', hz: 4.2, amp: -0.5 }, gain: 0.6, wet: 0.5 };
// Wind roaring through a gap in the canopy: a broad rush with the leaves' hiss on top.
const canopyRoar: LoopRecipe = { noise: { filter: 'bandpass', hz: 1100, q: 0.7, gain: 1.2 }, tone: { wave: 'sine', hz: 55, gain: 0.08 }, lfo: { wave: 'sine', hz: 0.7, amp: 0.6, filterHz: 500 }, gain: 0.55, wet: 0.5 };
const lava: LoopRecipe = { tone: { wave: 'sine', hz: 28, gain: 0.5 }, noise: { filter: 'lowpass', hz: 140, q: 0.7, gain: 1 }, lfo: { wave: 'sine', hz: 0.2, amp: 0.4 }, gain: 0.65, wet: 0.5 };

/** A hazard's voice: its loop, the level at rest, and the cues that telegraph it. */
export interface HazardSound {
  loop: LoopRecipe;
  /** Presence while the hazard is quiet (the machine idling); 0 = silent. */
  idle: number;
  /** Seconds before the danger starts that the loop swells and `warn` plays: the audible warning. */
  lead: number;
  warn?: CueName;
  /** When the danger arrives (a blocker lands, a gust hits, a sweeper sets off). */
  strike?: CueName;
  /** Each dropped item hitting the course. */
  land?: CueName;
}

/** Hazards carry a long way: the warning has to arrive while there is still time to react. */
export const HAZARD_NEAR = 140;
export const HAZARD_FAR = 950;

/** Voices for landmarks bound to a hazard: the landmark IS the hazard. */
const BOUND: Partial<Record<LandmarkKind, HazardSound>> = {
  sandbeast: { loop: beastGrowl, idle: 0.15, lead: 1.6, warn: 'roar', strike: 'impact' },
  mine: { loop: digger, idle: 0.25, lead: 1.2, warn: 'clank', land: 'impact' },
  skyfleet: { loop: shipEngines, idle: 0.3, lead: 1.5, warn: 'jet' },
  airshow: { loop: jets, idle: 0.1, lead: 1.2, warn: 'jet' },
  spaceport: { loop: rocket, idle: 0.15, lead: 1.5, warn: 'liftoff' },
  windfarm: { loop: gale, idle: 0.3, lead: 1.2, warn: 'gust' },
  iceStation: { loop: rotor, idle: 0.3, lead: 1.2, warn: 'gust' },
  avalancheSlope: { loop: avalanche, idle: 0.05, lead: 1.5, warn: 'rumble', land: 'impact' },
  glacierWall: { loop: iceGroan.loop, idle: 0.2, lead: 1, warn: 'creak', strike: 'crack' },
  icebreaker: { loop: iceCrusher, idle: 0.3, lead: 1.8, warn: 'horn' },
  harbor: { loop: shipEngines, idle: 0.25, lead: 1.8, warn: 'horn' },
  cruiseliner: { loop: shipEngines, idle: 0.25, lead: 1, warn: 'horn', strike: 'splash' },
  snowcatConvoy: { loop: diesel, idle: 0.3, lead: 1.2, warn: 'clank' },
  mammothHerd: { loop: footfalls, idle: 0.1, lead: 1.6, warn: 'stomp' },
  invasion: { loop: strider, idle: 0.2, lead: 1.5, warn: 'stomp' },
  volcano: { loop: lava, idle: 0.3, lead: 1, warn: 'whistle', land: 'impact' },
  whales: { loop: whaleSong, idle: 0.2, lead: 1, warn: 'song', strike: 'splash' },
  maglev: { loop: maglevWhine, idle: 0.05, lead: 2, warn: 'chime', strike: 'whoosh' },
  crane: { loop: craneWinch, idle: 0.2, lead: 1.2, warn: 'clank', land: 'clang' },
  demolition: { loop: condemned, idle: 0.15, lead: 1.5, warn: 'siren', strike: 'collapse' },
  cargoAirship: { loop: airshipFans, idle: 0.35, lead: 1.5, warn: 'horn', strike: 'gust' },
  fallingTree: { loop: timberStrain, idle: 0.1, lead: 1.5, warn: 'woodcreak', strike: 'crash' },
  herd: { loop: hoofbeats, idle: 0.08, lead: 1.6, warn: 'call', strike: 'hooves' },
  logSlide: { loop: logRumble, idle: 0.05, lead: 1.2, warn: 'snap', land: 'logland' },
  windRoar: { loop: canopyRoar, idle: 0.15, lead: 1.2, warn: 'leaves', strike: 'gust' },
};

/** A hazard with no landmark bound to it (a plain rockfall) gets a generic voice by type. */
const GENERIC: Record<HazardDef['type'], HazardSound> = {
  sweeper: { loop: diesel, idle: 0, lead: 1.2, warn: 'clank' },
  dropper: { loop: avalanche, idle: 0, lead: 1, warn: 'rumble', land: 'impact' },
  blocker: { loop: digger, idle: 0, lead: 1, warn: 'clank', strike: 'impact' },
  gust: { loop: gale, idle: 0, lead: 1, warn: 'gust' },
};

export function hazardSound(type: HazardDef['type'], bound: LandmarkKind | undefined): HazardSound {
  return (bound && BOUND[bound]) || GENERIC[type];
}

/** The sound of each landmark standing on its own (bound ones are voiced as their hazard). */
export const LANDMARK_SOUNDS: Record<LandmarkKind, SoundFamily | null> = {
  spaceport: rumble,
  invasion: scifi,
  wreck: scifi,
  skyfleet: scifi,
  mine: machine,
  stormwall: wind,
  sandbeast: { loop: beastGrowl, near: 80, far: 500 },
  bazaar: market,
  fair: party,
  grandstand: crowd,
  oasisTown: market,
  cliffVillage: market,
  colossus: scifi,
  windfarm: wind,
  balloons: burners,
  lighthouse: surf,
  pier: surf,
  cruiseliner: machine,
  regatta: surf,
  resort: market,
  harbor: machine,
  volcano: rumble,
  whales: { loop: whaleSong, near: 120, far: 700 },
  beachParty: party,
  airshow: { loop: jets, near: 150, far: 900 },
  icebreaker: machine,
  avalancheSlope: iceGroan,
  glacierWall: iceGroan,
  mammothHerd: { loop: footfalls, near: 80, far: 500 },
  iceStation: machine,
  skiJump: crowd,
  icePalace: ethereal,
  frozenFalls: waterfall,
  auroraSky: ethereal,
  snowcatConvoy: { loop: diesel, near: 60, far: 400 },
  maglev: { loop: maglevWhine, near: 60, far: 400 },
  crane: { loop: craneWinch, near: 60, far: 400 },
  demolition: { loop: condemned, near: 60, far: 400 },
  cargoAirship: { loop: airshipFans, near: 120, far: 700 },
  skyscrapers: null,
  neonBillboards: neonBuzz,
  stadium: crowd,
  hologramDragon: scifi,
  suspensionBridge: cables,
  skyTram: machine,
  fallingTree: { loop: timberStrain, near: 60, far: 400 },
  herd: { loop: hoofbeats, near: 70, far: 450 },
  logSlide: { loop: logRumble, near: 60, far: 400 },
  windRoar: wind,
  treeVillage: canopyVillage,
  lumberTown: sawmill,
  waterfall: waterfall,
  ruins: stoneHum,
  glowGrove: ethereal,
  ropeBridge: ropes,
};
