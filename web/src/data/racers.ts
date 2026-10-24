// The racer catalogue. Speeds are m/s (the HUD shows km/h). Ordered by price; every step up
// is a clear net gain (about +5% top speed, more pull, handling and boost) so the next glider
// is a goal. Armour is each one's character.
//
// The first six are on sale from the start (Halo Comet, ~28% faster than the starter, is the
// top of that ladder). The last two go on sale with Neon Meridian (unlockWorld): city cups pay
// 3.6x the desert, and by then a decent player owns a maxed Halo, so these are what that money
// buys. Priced (tools/sim-economy.ts) so a decent player buys the first with the Neon Cup's
// winnings, going into the Skyline Cup, and the second with the Zenith Crown's.
import type { RacerDef } from '../core/types.ts';

export const RACERS: RacerDef[] = [
  {
    id: 'dustwing',
    name: 'Dustwing',
    pilot: 'Kip Arro',
    blurb: 'A patched-up twin-fan skimmer. Forgiving, and faster than it looks.',
    price: 0,
    base: { topSpeed: 150, accel: 60, handling: 1.6, grip: 0.6, boostPower: 0.25, boostTank: 5, armor: 1.0 },
    visual: { style: 'skiff', primary: 0xd9822b, secondary: 0x5b4636, accent: 0xf2e3c6, glow: 0x6fd3ff },
  },
  {
    id: 'scarab',
    name: 'Scarab GT',
    pilot: 'Mesa Vonn',
    blurb: 'Armoured catamaran on one huge fan. Shrugs off walls.',
    price: 8000,
    base: { topSpeed: 158, accel: 64, handling: 1.55, grip: 0.7, boostPower: 0.26, boostTank: 5, armor: 1.8 },
    visual: { style: 'sponson', primary: 0x2f6b4f, secondary: 0x2a2a2a, accent: 0xe0b341, glow: 0x9dff6f },
  },
  {
    id: 'sirocco',
    name: 'Sirocco',
    pilot: 'Tal Ruun',
    blurb: 'A needle on an arrowhead wing. Brutally fast. Fragile.',
    price: 15000,
    base: { topSpeed: 166, accel: 70, handling: 1.65, grip: 0.62, boostPower: 0.28, boostTank: 5.5, armor: 0.9 },
    visual: { style: 'dart', primary: 0xc8c8d0, secondary: 0x8a1c1c, accent: 0x1c1c22, glow: 0xff6a3d },
  },
  {
    id: 'quadra',
    name: 'Quadra Vex',
    pilot: 'Odo Brask',
    blurb: 'Box wing, four fans, endless grip. Corners like it is on rails.',
    price: 24000,
    base: { topSpeed: 174, accel: 76, handling: 1.9, grip: 0.76, boostPower: 0.29, boostTank: 5.5, armor: 1.4 },
    visual: { style: 'quadfan', primary: 0x3a4fb8, secondary: 0xe8e8e8, accent: 0xffc93c, glow: 0x7a8bff },
  },
  {
    id: 'viper',
    name: 'Twin Viper',
    pilot: 'Sela Kai',
    blurb: 'Forward-swept and twitchy: it snaps into turns. For pilots who never lift.',
    price: 32000,
    base: { topSpeed: 182, accel: 82, handling: 2.05, grip: 0.74, boostPower: 0.31, boostTank: 6, armor: 1.15 },
    visual: { style: 'swept', primary: 0x8e2a8e, secondary: 0x141414, accent: 0x3dfcd0, glow: 0xff3dcf },
  },
  {
    id: 'halo',
    name: 'Halo Comet',
    pilot: 'Zeph Orrin',
    blurb: 'Ring-wing prototype. The fastest thing on any track.',
    price: 40000,
    base: { topSpeed: 192, accel: 90, handling: 2.15, grip: 0.8, boostPower: 0.33, boostTank: 6.5, armor: 1.6 },
    visual: { style: 'ringwing', primary: 0xf4f1e8, secondary: 0xc9a227, accent: 0x2b2b2b, glow: 0xffe27a },
  },
  {
    id: 'shard',
    name: 'Lumen Shard',
    pilot: 'Nyx Ardent',
    blurb: 'A mag-lev wedge traced in light. Turns on a pin; a wall still hurts.',
    price: 95000,
    unlockWorld: 'city',
    // Lightly armoured, like the Sirocco: the precision is bought with a fragile hull.
    base: { topSpeed: 202, accel: 97, handling: 2.3, grip: 0.85, boostPower: 0.35, boostTank: 6.5, armor: 1.1 },
    visual: { style: 'wedge', primary: 0x2c2950, secondary: 0x48438a, accent: 0xd8dcf0, glow: 0x3cf2ff },
  },
  {
    id: 'gyre',
    name: 'Orbis Gyre',
    pilot: 'Juno Vael',
    blurb: 'Twin hulls round a spinning ring fan. Heavy, armoured, and the fastest thing in the city.',
    price: 145000,
    unlockWorld: 'city',
    // The heaviest armour of all: the twin hulls take the hits for the ring.
    base: { topSpeed: 212, accel: 104, handling: 2.4, grip: 0.85, boostPower: 0.37, boostTank: 7, armor: 2.0 },
    visual: { style: 'gyre', primary: 0xb3122e, secondary: 0x262629, accent: 0xeeeeee, glow: 0xff3a5c },
  },
];

export function racerById(id: string): RacerDef {
  const r = RACERS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown racer id "${id}"`);
  return r;
}
