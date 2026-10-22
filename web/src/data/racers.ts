// The racer catalogue. Speeds are m/s (the HUD shows km/h). Ordered by price.
import type { RacerDef } from '../core/types.ts';

export const RACERS: RacerDef[] = [
  {
    id: 'dustwing',
    name: 'Dustwing',
    pilot: 'Kip Arro',
    blurb: 'A scrapyard twin-engine pod. Forgiving, and faster than it looks.',
    price: 0,
    base: { topSpeed: 150, accel: 60, handling: 1.6, grip: 0.6, boostPower: 0.25, cooling: 0.22, armor: 1.0 },
    visual: { style: 'twin', primary: 0xd9822b, secondary: 0x5b4636, accent: 0xf2e3c6, glow: 0x6fd3ff },
  },
  {
    id: 'scarab',
    name: 'Scarab GT',
    pilot: 'Mesa Vonn',
    blurb: 'Armoured hauler engines. Shrugs off walls, sheds heat fast.',
    price: 3000,
    base: { topSpeed: 155, accel: 52, handling: 1.4, grip: 0.7, boostPower: 0.22, cooling: 0.3, armor: 1.6 },
    visual: { style: 'heavy', primary: 0x2f6b4f, secondary: 0x2a2a2a, accent: 0xe0b341, glow: 0x9dff6f },
  },
  {
    id: 'sirocco',
    name: 'Sirocco',
    pilot: 'Tal Ruun',
    blurb: 'Needle-thin and brutally fast. Fragile. Runs hot.',
    price: 6500,
    base: { topSpeed: 172, accel: 64, handling: 1.5, grip: 0.55, boostPower: 0.28, cooling: 0.2, armor: 0.85 },
    visual: { style: 'needle', primary: 0xc8c8d0, secondary: 0x8a1c1c, accent: 0x1c1c22, glow: 0xff6a3d },
  },
  {
    id: 'quadra',
    name: 'Quadra Vex',
    pilot: 'Odo Brask',
    blurb: 'Four engines, four times the grip. Corners like it is on rails.',
    price: 11000,
    base: { topSpeed: 168, accel: 72, handling: 1.75, grip: 0.72, boostPower: 0.25, cooling: 0.26, armor: 1.2 },
    visual: { style: 'quad', primary: 0x3a4fb8, secondary: 0xe8e8e8, accent: 0xffc93c, glow: 0x7a8bff },
  },
  {
    id: 'viper',
    name: 'Twin Viper',
    pilot: 'Sela Kai',
    blurb: 'Split-frame racer that snaps into turns. For pilots who never lift.',
    price: 18000,
    base: { topSpeed: 185, accel: 70, handling: 1.9, grip: 0.68, boostPower: 0.3, cooling: 0.24, armor: 1.0 },
    visual: { style: 'split', primary: 0x8e2a8e, secondary: 0x141414, accent: 0x3dfcd0, glow: 0xff3dcf },
  },
  {
    id: 'halo',
    name: 'Halo Comet',
    pilot: 'Zeph Orrin',
    blurb: 'Ring-drive prototype. The fastest thing on the dunes.',
    price: 30000,
    base: { topSpeed: 198, accel: 78, handling: 1.85, grip: 0.75, boostPower: 0.32, cooling: 0.3, armor: 1.1 },
    visual: { style: 'ring', primary: 0xf4f1e8, secondary: 0xc9a227, accent: 0x2b2b2b, glow: 0xffe27a },
  },
];

export function racerById(id: string): RacerDef {
  const r = RACERS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown racer id "${id}"`);
  return r;
}
