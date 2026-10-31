import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import { BEACON_HUE, SURFACE, type FacadeStyle, type NeonHue, type NeonMode, type NeonTrim, type Surface } from '../../facadeStyle.ts';
import type { Corridor } from '../corridor.ts';
import { beats, type Rhythm } from '../rhythm.ts';
import { BARRIER_H, FENCE_TOP, KERB_H, PAVEMENT, QUAY, WATER_DROP, streetFrame } from '../street.ts';
import type { CityParts, PartShape } from './cityParts.ts';
import type { CitySite } from './citySite.ts';
import { METRO_RUN, PLAZA_HALF, PLAZA_R, SIDE_RUN, type Front, type StreetLayout } from './cityStreets.ts';

// What dresses a street section, drawn from the city's own instanced kit (cityParts.ts), so the
// whole street costs no draw call of its own: lamps, trees, benches, bus shelters, traffic lights
// and hydrants on the pavements behind the barrier; awnings, café tables, blade signs and
// spectators at the shopfronts; side streets closed off; and the section's set pieces: a plaza
// with a fountain, grandstands, a tunnel under a building block, the metro and footbridges
// overhead, and the harbour's quay and yachts. Small furniture is left off at low quality.
//
// Nothing stands inside the drivable area: everything on the road side of the barrier is
// overhead (a lamp's arm, the tunnel block, the metro, a footbridge), and track-check keeps
// street sections free of jumps, so no racer ever flies up into it.

/** Street lamps: their rhythm (never one even pitch: they pass at 400 m/s), where they stand, how tall, the arm's reach over the road. */
const LAMPS: Rhythm = { gap: [24, 42], salt: 0x1a4e };
const LAMP_AT = 1.3;
const LAMP_H = 9;
const LAMP_ARM = 2.6;
/** Trees in planters between the lamps, mid-pavement; a crown this wide and tall. */
const TREES: Rhythm = { gap: [14, 30], salt: 0x7ee5 };
const TREE_AT = 3.6;
const CROWN: readonly [number, number] = [4.2, 6.4];
/** Benches, bins and hydrants (small furniture, high quality only): shares per tree gap. */
const BENCH_SHARE = 0.45;
const HYDRANT_SHARE = 0.2;
/** A bus shelter about every this many metres of shopfront. */
const SHELTER_EVERY = 320;
/** Café tables under an awning: this share of awnings has them. */
const CAFE_SHARE = 0.4;
/** Awnings: this share of shop bays has one, sloping this far out over the pavement. */
const AWNING_SHARE = 0.45;
const AWNING_OUT = 2.2;
const AWNING_Y: readonly [number, number] = [3.0, 3.75];
const BAY = 4.6;
/** Blade signs over the pavement: this share of shops has one, its foot over the road edge and its height range, metres. */
const BLADE_SHARE = 0.6;
const BLADE_Y = 4.7;
const BLADE_H: readonly [number, number] = [2.5, 5];
/** Spectators: on this share of podium roofs (a terrace over the shops), and in knots behind the barrier. */
const TERRACE_SHARE = 0.35;
const KNOT_SHARE = 0.25;
/** A person: body width, height (shoulders) and depth, and the head's size, metres. */
const PERSON: readonly [number, number, number] = [0.48, 1.45, 0.3];
const HEAD = 0.26;
/** An open stretch of building line this long or more gets a crowd (this share) or a hedge. */
const OPEN_MIN = 6;
const OPEN_CROWD = 0.6;
/** Grandstand tiers: depth, rise, how many at most, the roof's clearance over the top tier. */
const TIER_DEPTH = 2.4;
const TIER_RISE = 1.5;
const TIERS = 9;
const STAND_ROOF = 4;
/** The plaza: the fountain basin's radius, and the jets' height range. */
const BASIN_R = 8;
const JETS: readonly [number, number] = [3, 7];
/** The tunnel block: its soffit's clearance over the road, its height, its light strips' rhythm and colonnade pitch. */
const TUNNEL_CLEAR = 12;
const TUNNEL_BLOCK = 22;
const TUNNEL_LIGHTS: Rhythm = { gap: [5, 13], salt: 0x7b10 };
const COLUMNS: Rhythm = { gap: [6, 11], salt: 0xc01a };
const TUNNEL_SEG = 10;
/** The metro: its deck's clearance, depth and width, how far it runs off each side, a train's length. */
const METRO_CLEAR = 13;
const METRO_DECK: readonly [number, number] = [1.8, 8];
const TRAIN: readonly [number, number, number] = [3.3, 3.6, 64];
/** Footbridges: deck clearance, width, parapet height. */
const FOOT_CLEAR = 7.5;
const FOOT_W = 3.4;
const PARAPET = 1.3;
/** The side street's pavements are this wide. */
const SIDE_PAVE = 3;
/** Yachts: how often along the quay, their length, how far out (beyond the quay edge) they lie. */
const YACHT_EVERY: readonly [number, number] = [36, 66];
const YACHT_L: readonly [number, number] = [18, 58];
const YACHT_OUT: readonly [number, number] = [3, 14];
const YACHT_FAR: readonly [number, number] = [45, 110];
/** A yacht's deck height, and how much length it takes per deck of cabins (three at most). */
const YACHT_DECK = 2.4;
const YACHT_PER_DECK = 16;
/** This share of yachts carries a mast. */
const MAST_SHARE = 0.6;
/** Quay bollards every this many metres; a kiosk about every this many metres of quay or plaza. */
const BOLLARDS: Rhythm = { gap: [9, 14], salt: 0xb011 };
const KIOSK_EVERY = 160;

/** Tints (sRGB): street metal, stone, planting boxes, crowds, awnings, hulls. */
const METAL = new THREE.Color(0x2c2e36);
const STONE = new THREE.Color(0x77736c);
const PLANTER = new THREE.Color(0x5a5650);
const BARK = new THREE.Color(0x3a2a20);
const HYDRANT = new THREE.Color(0xa8302a);
/** Clothes: mostly dark and muted, a few in team colours; skin tones for heads. */
const CROWD = [0x2a2a32, 0x3a3a46, 0x1e2026, 0x4a3a32, 0x5a5a64, 0x2a3a4a, 0xc83a3a, 0xe8c44c, 0x3a6ad8, 0xe4e0d8];
const SKIN = [0xc89878, 0x8a5a3a, 0xe8c0a0, 0x5a3a2a, 0xb07a58];
const AWNINGS = [0x8a2a3a, 0x2a5a4a, 0x3a3a6a, 0x9a7a2a, 0x6a2a6a, 0x2a4a7a];
const HULL = [0xe8e8ee, 0xdcdce4, 0x1e2a3a, 0xf0ece0, 0x2a2a30];
const BOOT = new THREE.Color(0x1a2030);
/** Cabins: tinted glass round the decks, so the white hull reads as the boat under them. */
const CABIN = new THREE.Color(0x3a4a5a);
const ASPHALT = new THREE.Color(0x26282f);
const PAVE = new THREE.Color(0x7c7c84);

const style = (surface: Surface, o: { hue?: NeonHue; mode?: NeonMode; grime?: number; light?: number; trim?: NeonTrim } = {}): FacadeStyle => ({
  surface,
  grime: o.grime ?? 0.2,
  light: o.light ?? 1,
  hue: o.hue ?? 0,
  mode: o.mode ?? 'steady',
  trim: o.trim ?? 'none',
  elevated: true,
});
const PLAIN = style(SURFACE.plain);
/** People are plain and clean: no panel seams worth the name at their size, no street stain. */
const PERSON_STYLE = style(SURFACE.plain, { grime: 0 });
const LAMP = style(SURFACE.lamp);
const GARDEN = style(SURFACE.garden);

export interface StreetKitContext {
  cor: Corridor;
  site: CitySite;
  parts: CityParts;
  /** Build the small furniture too (high quality). */
  detail: boolean;
  seed: number;
}

/** A street side's frame at u metres into the section: world placement in (along, out, up). */
class Side {
  constructor(
    readonly x: StreetKitContext,
    readonly l: StreetLayout,
    readonly side: -1 | 1,
  ) {}

  frame(u: number) {
    const r = this.x.cor.ribbon;
    const k = Math.round(r.wrap(this.l.s0 + Math.max(0, Math.min(this.l.length, u))) / r.step);
    const f = streetFrame(this.x.cor, k, this.side);
    const t = r.samples[this.x.cor.idx(k)].tangent;
    return { ...f, yaw: Math.atan2(-t.z, t.x), k };
  }

  /** World point `dx` out from the boundary, `y` over the road edge, u along. */
  point(u: number, dx: number, y = 0): THREE.Vector3 {
    const p = this.frame(u).at(dx, y);
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  /** A kit shape w (along) × h × d (across), its base at `y` over the road edge, `dx` out from the boundary. */
  put(shape: PartShape, u: number, dx: number, y: number, w: number, h: number, d: number, tint: THREE.Color, st: FacadeStyle, turn = 0): void {
    const f = this.frame(u);
    const p = f.at(dx, y);
    this.x.parts.add(shape, p.x, p.y, p.z, w, h, d, f.yaw + turn, tint, st);
  }

  /** Room over the pavement at u, dx before a sightline cap (metres over the road edge). */
  headroom(u: number, dx: number, size: number): number {
    const f = this.frame(u);
    const p = f.at(dx, 0);
    return this.x.site.roofCap({ x: p.x, z: p.z, w: size, d: size, yaw: 0 }) - p.y;
  }
}

export function dressStreets(x: StreetKitContext, layouts: StreetLayout[]): void {
  const rng = mulberry32(x.seed ^ 0x5ee7);
  for (const l of layouts) {
    for (const side of [-1, 1] as const) {
      const S = new Side(x, l, side);
      const fronts = l.fronts.filter((f) => f.side === side);
      pavement(S, fronts, rng);
      for (const f of fronts) {
        if (f.kind === 'shop') shopfront(S, f, rng);
        else if (f.kind === 'side') sideStreet(S, f, rng);
        else if (f.kind === 'stand') grandstand(S, f, rng);
        else if (f.kind === 'quay') quay(S, f, rng);
        else if (f.kind === 'open') openFront(S, f, rng);
      }
      fencePosts(S);
    }
    const p = l.section.plaza;
    if (p) plaza(new Side(x, l, p.side), x.cor.ribbon.wrap(x.cor.ribbon.paramToS(p.at) - l.s0), rng);
    const t = l.section.tunnel;
    if (t) tunnelBlock(x, l, at(x, l, t.from), at(x, l, t.to), rng);
    if (l.section.metro !== undefined) metro(x, l, at(x, l, l.section.metro), rng);
    for (const fb of l.section.footbridges ?? []) footbridge(x, l, at(x, l, fb), rng);
  }
}

/** Metres into the section of a main-loop param. */
function at(x: StreetKitContext, l: StreetLayout, p: number): number {
  return x.cor.ribbon.wrap(x.cor.ribbon.paramToS(p) - l.s0);
}

function kindAt(fronts: Front[], u: number): Front | undefined {
  return fronts.find((f) => u >= f.u0 && u < f.u1);
}

/** Lamps along the whole side; trees, benches and hydrants in front of the shops and open lots. */
function pavement(S: Side, fronts: Front[], rng: Rng): void {
  const { l, side } = S;
  const salt = side > 0 ? 0x9e37 : 0;
  for (const u of beats({ gap: LAMPS.gap, salt: LAMPS.salt ^ salt ^ l.s0 }, l.length)) {
    S.put('box', u, LAMP_AT, KERB_H, 0.24, LAMP_H, 0.24, METAL, PLAIN);
    S.put('box', u, LAMP_AT - LAMP_ARM / 2, LAMP_H - 0.25, 0.14, 0.14, LAMP_ARM, METAL, PLAIN);
    S.put('box', u, LAMP_AT - LAMP_ARM + 0.3, LAMP_H - 0.5, 0.5, 0.22, 1.1, METAL, LAMP);
  }
  const quay = fronts.some((f) => f.kind === 'quay');
  if (quay) return;
  for (const u of beats({ gap: TREES.gap, salt: TREES.salt ^ salt ^ l.s0 }, l.length)) {
    const f = kindAt(fronts, u);
    if (!f || (f.kind !== 'shop' && f.kind !== 'open' && f.kind !== 'stand')) continue;
    const crown = range(rng, CROWN[0], CROWN[1]);
    if (S.headroom(u, TREE_AT, crown) > crown + KERB_H + 1) {
      S.put('box', u, TREE_AT, KERB_H, 1.7, 0.75, 1.7, PLANTER, style(SURFACE.plain, { grime: 0.5 }));
      S.put('cylinder', u, TREE_AT, KERB_H + 0.7, 0.35, crown * 0.45, 0.35, BARK, PLAIN);
      S.put('dome', u, TREE_AT, KERB_H + crown * 0.35, crown * 0.75, crown * 1.3, crown * 0.75, PLANTER, GARDEN);
    }
    if (!S.x.detail) continue;
    const r = rng();
    if (r < BENCH_SHARE) {
      S.put('box', u + 4, TREE_AT + 0.8, KERB_H + 0.42, 2.2, 0.1, 0.6, METAL, PLAIN);
      S.put('box', u + 4, TREE_AT + 1.05, KERB_H + 0.5, 2.2, 0.55, 0.1, METAL, PLAIN);
      S.put('box', u + 4, TREE_AT + 0.8, KERB_H, 1.8, 0.42, 0.4, METAL, PLAIN);
    } else if (r < BENCH_SHARE + HYDRANT_SHARE) {
      S.put('cylinder', u + 3, 1.2, KERB_H, 0.38, 0.8, 0.38, HYDRANT, PLAIN);
    } else {
      S.put('cylinder', u + 3, TREE_AT + 0.6, KERB_H, 0.6, 1, 0.6, METAL, PLAIN);
    }
  }
  // A bus shelter now and then in front of a shop.
  let next = SHELTER_EVERY / 2;
  for (const f of fronts) {
    if (f.kind !== 'shop' || f.u0 < next || f.u1 - f.u0 < 10) continue;
    const u = (f.u0 + f.u1) / 2;
    if (S.headroom(u, 4, 7) < 3.2) continue;
    next = f.u1 + SHELTER_EVERY;
    S.put('box', u, 4.1, KERB_H + 2.6, 7, 0.22, 2.6, METAL, PLAIN);
    S.put('box', u, 5.3, KERB_H, 7, 2.6, 0.08, new THREE.Color(0x30404a), style(SURFACE.curtain));
    S.put('box', u + 3.4, 4.1, KERB_H + 0.3, 0.2, 2.2, 1.8, METAL, style(SURFACE.holo, { hue: Math.floor(rng() * 3) as NeonHue }));
    S.put('box', u, 4.8, KERB_H + 0.45, 4, 0.1, 0.6, METAL, PLAIN);
  }
}

/** Awnings, café tables, blade signs and a terrace of spectators at a shop's front. */
function shopfront(S: Side, f: Front, rng: Rng): void {
  const lot = f.lot;
  if (!lot || f.roof === undefined) throw new Error('shop front without its lot');
  const front = PAVEMENT;
  const bays = Math.floor((f.u1 - f.u0) / BAY);
  for (let b = 0; b < bays; b++) {
    const u = f.u0 + (b + 0.5) * ((f.u1 - f.u0) / bays);
    if (rng() < AWNING_SHARE) {
      const a = S.point(u, front - 0.05, AWNING_Y[1]);
      const z = S.point(u, front - AWNING_OUT, AWNING_Y[0]);
      S.x.parts.beam(a, z, BAY * 0.9, 0.1, new THREE.Color(AWNINGS[Math.floor(rng() * AWNINGS.length)]), PLAIN);
      if (S.x.detail && rng() < CAFE_SHARE) {
        for (const o of [-1, 1]) {
          S.put('cylinder', u + o * 1.1, front - 1.4, KERB_H, 0.8, 0.75, 0.8, STONE, PLAIN);
          S.put('box', u + o * 1.1, front - 0.7, KERB_H, 0.45, 0.9, 0.45, METAL, PLAIN);
        }
      }
    }
  }
  // A blade sign standing out over the pavement at one end, lit glyphs, where the sightline lets it.
  const blade = range(rng, BLADE_H[0], BLADE_H[1]);
  if (rng() < BLADE_SHARE && S.headroom(f.u0, front - 0.9, 2) > BLADE_Y + blade) {
    S.put('box', f.u0 + 0.6, front - 0.9, BLADE_Y, 0.25, blade, 1.6, METAL, style(SURFACE.sign, { hue: Math.floor(rng() * 3) as NeonHue }));
  }
  const y = f.roof - (f.pavement - KERB_H);
  if (S.x.detail && rng() < TERRACE_SHARE && S.headroom((f.u0 + f.u1) / 2, front + 1.2, f.u1 - f.u0) > y + PERSON[1] + HEAD) {
    S.put('box', (f.u0 + f.u1) / 2, front + 0.3, y, f.u1 - f.u0 - 1, 1.05, 0.08, METAL, PLAIN);
    crowd(S, f.u0 + 1, f.u1 - 1, front + 1.2, y, rng);
  }
  if (S.x.detail && rng() < KNOT_SHARE) crowd(S, f.u0 + 2, f.u0 + Math.min(10, f.u1 - f.u0 - 2), 1.1, KERB_H, rng);
}

/**
 * Where the building line stays open (the inside of a bend, kept low for the sightline): a crowd
 * along the barrier, or a low hedge along the back of the pavement.
 */
function openFront(S: Side, f: Front, rng: Rng): void {
  if (f.u1 - f.u0 < OPEN_MIN) return;
  if (rng() < OPEN_CROWD) {
    crowd(S, f.u0 + 1, f.u1 - 1, 1.2, KERB_H, rng);
    if (S.x.detail) crowd(S, f.u0 + 1, f.u1 - 1, 2.1, KERB_H, rng);
  } else {
    S.put('box', (f.u0 + f.u1) / 2, PAVEMENT - 0.6, KERB_H, f.u1 - f.u0 - 1, 0.9, 1, PLANTER, GARDEN);
  }
}

/** People standing in a row from u0 to u1, `dx` out, on a floor `y` over the road edge. */
function crowd(S: Side, u0: number, u1: number, dx: number, y: number, rng: Rng): void {
  for (let u = u0; u < u1; u += range(rng, 0.6, 1.4)) {
    person(S.point(u, dx + range(rng, -0.3, 0.3), y), S.frame(u).yaw, S.x.parts, rng);
  }
}

/** One person standing at p (feet), facing across the street. */
function person(p: THREE.Vector3, yaw: number, parts: CityParts, rng: Rng): void {
  const h = PERSON[1] * range(rng, 0.9, 1.1);
  parts.add('box', p.x, p.y, p.z, PERSON[0], h, PERSON[2], yaw, new THREE.Color(CROWD[Math.floor(rng() * CROWD.length)]), PERSON_STYLE);
  parts.add('box', p.x, p.y + h, p.z, HEAD, HEAD * 1.15, HEAD, yaw, new THREE.Color(SKIN[Math.floor(rng() * SKIN.length)]), PERSON_STYLE);
}

/** A side street: its floor and pavements running back into the block, closed off at the mouth, a signal at each corner. */
function sideStreet(S: Side, f: Front, rng: Rng): void {
  const u = (f.u0 + f.u1) / 2;
  const w = f.u1 - f.u0;
  const y = -0.12;
  S.put('box', u, PAVEMENT + SIDE_RUN / 2, y - 1, w - 2 * SIDE_PAVE, 1 + KERB_H, SIDE_RUN, ASPHALT, style(SURFACE.plain, { grime: 0.7 }));
  for (const o of [-1, 1]) {
    S.put('box', u + o * (w / 2 - SIDE_PAVE / 2), PAVEMENT + SIDE_RUN / 2, y - 1, SIDE_PAVE, 1 + KERB_H * 2, SIDE_RUN, PAVE, PLAIN);
    // A signal at each corner of the mouth, flashing red: the road is closed for the race.
    S.put('box', u + o * (w / 2 - 0.6), PAVEMENT - 0.8, KERB_H, 0.2, 4.4, 0.2, METAL, PLAIN);
    S.put('box', u + o * (w / 2 - 0.6), PAVEMENT - 0.8, KERB_H + 4.2, 0.45, 1.2, 0.45, METAL, PLAIN);
    S.put('box', u + o * (w / 2 - 0.6), PAVEMENT - 1.05, KERB_H + 4.95, 0.3, 0.3, 0.06, METAL, style(SURFACE.glow, { hue: BEACON_HUE, mode: 'flicker' }));
  }
  // Closed: a row of accent and white road blocks across the mouth, a lamp halfway down.
  const blocks = Math.floor((w - 2 * SIDE_PAVE) / 2);
  for (let i = 0; i < blocks; i++) {
    const c = i % 2 ? new THREE.Color(0xf4f0e8) : new THREE.Color(0xd8304a);
    S.put('box', f.u0 + SIDE_PAVE + 1 + i * 2, PAVEMENT + 2, KERB_H, 1.8, 1, 0.6, c, PLAIN);
  }
  S.put('box', u + (w / 2 - 1), PAVEMENT + SIDE_RUN * 0.5, KERB_H, 0.2, 7, 0.2, METAL, PLAIN);
  S.put('box', u + (w / 2 - 1.6), PAVEMENT + SIDE_RUN * 0.5, KERB_H + 6.6, 1, 0.2, 0.5, METAL, LAMP);
  if (S.x.detail && rng() < 0.5) crowd(S, f.u0 + SIDE_PAVE, f.u1 - SIDE_PAVE, PAVEMENT + 3.2, KERB_H, rng);
}

/** Tiers of spectators rising back from the building line, a roof over them. */
function grandstand(S: Side, f: Front, rng: Rng): void {
  const lot = f.lot;
  if (!lot) throw new Error('grandstand front without its lot');
  const u = (f.u0 + f.u1) / 2;
  const w = f.u1 - f.u0 - 1;
  const room = S.headroom(u, PAVEMENT + lot.d / 2, lot.d);
  const tiers = Math.min(TIERS, Math.floor((lot.d - 2) / TIER_DEPTH), Math.floor((room - STAND_ROOF - 2) / TIER_RISE));
  if (tiers < 2) return;
  const concrete = new THREE.Color(0x8a8a90);
  for (let t = 0; t < tiers; t++) {
    const dx = PAVEMENT + 1 + (t + 0.5) * TIER_DEPTH;
    S.put('box', u, dx, -2, w, 2 + KERB_H + (t + 1) * TIER_RISE, TIER_DEPTH, concrete, PLAIN);
    if (S.x.detail || t % 2 === 0) crowd(S, f.u0 + 1, f.u1 - 1, dx - 0.4, KERB_H + (t + 1) * TIER_RISE, rng);
  }
  const top = KERB_H + tiers * TIER_RISE + STAND_ROOF;
  const back = PAVEMENT + 1 + tiers * TIER_DEPTH;
  S.put('box', u, PAVEMENT + 1 + (tiers * TIER_DEPTH) / 2, top, w + 2, 0.5, tiers * TIER_DEPTH + 3, new THREE.Color(0xd8d8e0), style(SURFACE.plain, { grime: 0.1 }));
  for (const o of [-1, 1]) S.put('box', u + (o * w) / 2, back, -1, 0.5, top + 1, 0.5, METAL, PLAIN);
  // A lit sign along the roof's front.
  S.put('box', u, PAVEMENT + 0.2, top - 1.2, w * 0.8, 1.2, 0.2, METAL, style(SURFACE.sign, { hue: Math.floor(rng() * 3) as NeonHue }));
}

/** The quay: bollards along its edge, kiosks, yachts moored in the basin off it. */
function quay(S: Side, f: Front, rng: Rng): void {
  for (const u of beats({ gap: BOLLARDS.gap, salt: BOLLARDS.salt ^ S.l.s0 }, S.l.length)) {
    if (u < f.u0 || u > f.u1) continue;
    S.put('cylinder', u, QUAY - 0.6, KERB_H, 0.5, 0.6, 0.5, METAL, PLAIN);
  }
  for (let u = f.u0 + KIOSK_EVERY / 2; u < f.u1; u += KIOSK_EVERY) kiosk(S, u, QUAY - 3.5, rng);
  const water = -WATER_DROP;
  for (let u = f.u0 + range(rng, 5, 20); u < f.u1 - 10; u += range(rng, YACHT_EVERY[0], YACHT_EVERY[1])) {
    yacht(S, u, QUAY + range(rng, YACHT_OUT[0], YACHT_OUT[1]), water, rng);
    // Another lies at anchor further out now and then.
    if (rng() < 0.5) yacht(S, u + range(rng, -10, 10), QUAY + range(rng, YACHT_FAR[0], YACHT_FAR[1]), water, rng);
  }
}

/** A yacht moored along the quay `dx` out (its near side): white hull, decks of lit cabins, sometimes a mast. */
function yacht(S: Side, u: number, dx: number, water: number, rng: Rng): void {
  const len = range(rng, YACHT_L[0], YACHT_L[1]);
  const beam = len * 0.22;
  const x = dx + beam / 2;
  const hull = new THREE.Color(HULL[Math.floor(rng() * HULL.length)]);
  const white = style(SURFACE.plain, { grime: 0.05 });
  S.put('box', u, x, water - 0.8, len * 0.8, YACHT_DECK + 0.8, beam, hull, white);
  // A dark boot stripe at the waterline and a rubbing strake along the sheer.
  S.put('box', u, x, water - 0.05, len * 0.8 + 0.1, 0.35, beam + 0.1, BOOT, white);
  S.put('box', u, x, water + YACHT_DECK - 0.3, len * 0.8 + 0.1, 0.18, beam + 0.12, METAL, white);
  // The bow: half a dome at the hull's front end reads as a rounded prow from the road.
  S.put('dome', u + len * 0.4, x, water - 0.8, len * 0.3, 2 * (YACHT_DECK + 0.8), beam, hull, white);
  let y = water + YACHT_DECK;
  let deckLen = len * 0.55;
  for (let d = 0; d < Math.min(3, Math.floor(len / YACHT_PER_DECK)); d++) {
    S.put('box', u - len * 0.05, x, y, deckLen, YACHT_DECK, beam * (0.8 - d * 0.12), CABIN, style(SURFACE.curtain, { light: 1.6 }));
    y += YACHT_DECK;
    deckLen *= 0.7;
  }
  // A sailing yacht's mast stands over the barrier, its masthead light blinking: the marina reads from the road.
  // A lit cockpit at the stern and a radar arch over the top deck.
  S.put('box', u - len * 0.36, x, water + YACHT_DECK, len * 0.08, 0.9, beam * 0.6, METAL, LAMP);
  S.put('box', u - len * 0.05, x, y, 0.4, 1.6, beam * 0.5, METAL, white);
  if (rng() < MAST_SHARE) S.put('spire', u, x, y, 0.7, len * 0.9, 0.7, METAL, style(SURFACE.plain, { hue: BEACON_HUE, mode: 'flicker', trim: 'crown' }));
}

function kiosk(S: Side, u: number, dx: number, rng: Rng): void {
  S.put('box', u, dx, KERB_H, 3, 2.6, 2.2, new THREE.Color(0x3a4a5a), style(SURFACE.shop, { grime: 0.2 }));
  S.put('box', u, dx, KERB_H + 2.6, 3.6, 0.25, 2.8, METAL, PLAIN);
  S.put('box', u, dx, KERB_H + 2.85, 2.6, 0.7, 0.2, METAL, style(SURFACE.sign, { hue: Math.floor(rng() * 3) as NeonHue }));
}

/** Fence posts along the barrier's top, never at one even pitch. */
function fencePosts(S: Side): void {
  const cor = S.x.cor;
  for (const u of beats({ gap: [3.5, 5.5], salt: 0xfe ^ S.l.s0 ^ (S.side > 0 ? 1 : 0) }, S.l.length)) {
    const k = S.frame(u).k;
    if (cor.open(k, S.side) || cor.shape.quay[S.side > 0 ? 1 : 0][cor.idx(k)]) continue;
    S.put('box', u, 0.4, BARRIER_H - 0.1, 0.1, FENCE_TOP - BARRIER_H + 0.1, 0.1, METAL, PLAIN);
  }
}

/** A plaza beside the road: a paved square round a lit fountain, lamps, trees and benches where the sightline lets them stand. */
function plaza(S: Side, u: number, rng: Rng): void {
  const dx = PAVEMENT + PLAZA_R + 2;
  const centreRoom = S.headroom(u, dx, PLAZA_R);
  S.put('cylinder', u, dx, -0.6, PLAZA_R * 2, 0.6 + KERB_H, PLAZA_R * 2, new THREE.Color(0x8c8a86), style(SURFACE.plain, { grime: 0.3 }));
  S.put('cylinder', u, dx, KERB_H, BASIN_R * 2, 0.8, BASIN_R * 2, STONE, PLAIN);
  S.put('cylinder', u, dx, KERB_H + 0.2, BASIN_R * 2 - 1, 0.65, BASIN_R * 2 - 1, METAL, style(SURFACE.glow, { hue: 1 }));
  const jets = Math.min(JETS[1], Math.max(1.2, centreRoom - 1));
  S.put('spire', u, dx, KERB_H, 1.2, jets, 1.2, METAL, style(SURFACE.glow, { hue: 1 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = Math.min(range(rng, JETS[0], JETS[1]) * 0.5, jets);
    S.put('spire', u + Math.cos(a) * BASIN_R * 0.6, dx + Math.sin(a) * BASIN_R * 0.6, KERB_H, 0.4, h, 0.4, METAL, style(SURFACE.glow, { hue: 1 }));
  }
  // A ring of lamps, benches and trees round the square, each kept under the sightline.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const uu = u + Math.cos(a) * (PLAZA_R - 4);
    const dd = dx + Math.sin(a) * (PLAZA_R - 4);
    if (dd < PAVEMENT + 2) continue;
    if (i % 3 === 0 && S.headroom(uu, dd, 6) > CROWN[1] + 1) {
      S.put('box', uu, dd, KERB_H, 1.7, 0.75, 1.7, PLANTER, PLAIN);
      S.put('dome', uu, dd, KERB_H + 2, 4.5, 7, 4.5, PLANTER, GARDEN);
    } else if (i % 3 === 1 && S.headroom(uu, dd, 2) > 6) {
      S.put('box', uu, dd, KERB_H, 0.2, 5, 0.2, METAL, PLAIN);
      S.put('box', uu, dd, KERB_H + 5, 0.6, 0.6, 0.6, METAL, LAMP);
    } else if (S.x.detail) {
      S.put('box', uu, dd, KERB_H, 2.2, 0.45, 0.6, METAL, PLAIN);
    }
  }
  kiosk(S, u - PLAZA_R * 0.7, dx + PLAZA_R * 0.5, rng);
  // The hairpin's crowd, along the barrier the whole way round.
  crowd(S, u - PLAZA_HALF + 6, u + PLAZA_HALF - 6, 1.6, KERB_H, rng);
  if (S.x.detail) crowd(S, u - PLAZA_HALF + 8, u + PLAZA_HALF - 8, 2.4, KERB_H, rng);
}

/** A building block bridging the road: its soffit lit by strips, a colonnade on both pavements, a glyph sign over the mouth. */
function tunnelBlock(x: StreetKitContext, l: StreetLayout, u0: number, u1: number, rng: Rng): void {
  const L = new Side(x, l, -1);
  const R = new Side(x, l, 1);
  const tint = new THREE.Color([0x3a3a44, 0x4a4640, 0x2c3440][Math.floor(rng() * 3)]);
  const body = style(SURFACE.ribbon, { grime: 0.3 });
  for (let u = u0; u < u1; u += TUNNEL_SEG) {
    const a = L.point(u + TUNNEL_SEG / 2, PAVEMENT);
    const b = R.point(u + TUNNEL_SEG / 2, PAVEMENT);
    const span = a.distanceTo(b) + 4;
    const f = L.frame(u + TUNNEL_SEG / 2);
    const y = Math.max(a.y, b.y) + TUNNEL_CLEAR;
    x.parts.add('box', (a.x + b.x) / 2, y, (a.z + b.z) / 2, TUNNEL_SEG + 0.4, TUNNEL_BLOCK, span, f.yaw, tint, body);
  }
  for (const u of beats(TUNNEL_LIGHTS, l.length)) {
    if (u < u0 || u > u1) continue;
    const a = L.point(u, 0);
    const b = R.point(u, 0);
    const f = L.frame(u);
    x.parts.add('box', (a.x + b.x) / 2, Math.max(a.y, b.y) + TUNNEL_CLEAR - 0.25, (a.z + b.z) / 2, 0.5, 0.25, a.distanceTo(b) - 2, f.yaw, METAL, LAMP);
  }
  for (const S of [L, R]) {
    for (const u of beats(COLUMNS, l.length)) {
      if (u < u0 || u > u1) continue;
      S.put('box', u, PAVEMENT - 0.9, -0.5, 0.9, TUNNEL_CLEAR + 0.5, 0.9, STONE, PLAIN);
    }
  }
  // The mouth: a band of glyph signs across the block's face, toward oncoming racers.
  const a = L.point(u0, PAVEMENT);
  const b = R.point(u0, PAVEMENT);
  const f = L.frame(u0);
  const tx = Math.cos(f.yaw);
  const tz = -Math.sin(f.yaw);
  x.parts.add('box', (a.x + b.x) / 2 - tx * 0.4, Math.max(a.y, b.y) + TUNNEL_CLEAR + 2, (a.z + b.z) / 2 - tz * 0.4, 0.3, 4, a.distanceTo(b) * 0.7, f.yaw, METAL, style(SURFACE.sign, { hue: Math.floor(rng() * 3) as NeonHue }));
}

/** The metro crossing over on its viaduct: a deck from piers beyond the building line on both sides, a lit train on it. */
function metro(x: StreetKitContext, l: StreetLayout, u: number, rng: Rng): void {
  const L = new Side(x, l, -1);
  const R = new Side(x, l, 1);
  const a = L.point(u, 0);
  const b = R.point(u, 0);
  const f = L.frame(u);
  const y = Math.max(a.y, b.y) + METRO_CLEAR;
  const half = a.distanceTo(b) / 2;
  const span = 2 * (half + PAVEMENT + METRO_RUN);
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  const deck = new THREE.Color(0x5a5c64);
  x.parts.add('box', cx, y, cz, METRO_DECK[1], METRO_DECK[0], span, f.yaw, deck, PLAIN);
  for (const S of [L, R]) {
    for (const dx of [PAVEMENT + 6, PAVEMENT + METRO_RUN * 0.55, PAVEMENT + METRO_RUN - 4]) {
      const p = S.point(u, dx);
      x.parts.add('box', p.x, p.y - 3, p.z, 2.6, y - p.y + 3, 2.6, f.yaw, deck, PLAIN);
    }
  }
  // A train on the deck, its windows lit, off centre on its track.
  const off = range(rng, -0.4, 0.4) * (span - TRAIN[2]);
  const ox = Math.sin(f.yaw) * off;
  const oz = Math.cos(f.yaw) * off;
  x.parts.add('box', cx + ox, y + METRO_DECK[0], cz + oz, TRAIN[0], TRAIN[1], TRAIN[2], f.yaw, new THREE.Color(0xc8ccd4), style(SURFACE.ribbon, { light: 2 }));
  x.parts.add('box', cx, y - 0.3, cz, METRO_DECK[1] * 0.6, 0.3, span, f.yaw, METAL, style(SURFACE.glow, { hue: 1 }));
}

/** A footbridge over the road between the building lines, its parapet a band of glyph signs. */
function footbridge(x: StreetKitContext, l: StreetLayout, u: number, rng: Rng): void {
  const L = new Side(x, l, -1);
  const R = new Side(x, l, 1);
  const a = L.point(u, PAVEMENT);
  const b = R.point(u, PAVEMENT);
  const f = L.frame(u);
  const y = Math.max(a.y, b.y) + FOOT_CLEAR;
  const span = a.distanceTo(b);
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  x.parts.add('box', cx, y, cz, FOOT_W, 0.6, span, f.yaw, new THREE.Color(0x5c5e66), PLAIN);
  const tx = Math.cos(f.yaw) * (FOOT_W / 2);
  const tz = -Math.sin(f.yaw) * (FOOT_W / 2);
  for (const o of [-1, 1]) {
    x.parts.add('box', cx + o * tx, y + 0.6, cz + o * tz, 0.2, PARAPET, span, f.yaw, METAL, style(SURFACE.sign, { hue: Math.floor(rng() * 3) as NeonHue }));
  }
  x.parts.add('box', cx, y - 0.2, cz, FOOT_W * 0.5, 0.2, span - 2, f.yaw, METAL, LAMP);
  for (const S of [L, R]) S.put('box', u, PAVEMENT - 0.7, -0.5, 0.7, FOOT_CLEAR + 0.5, 0.7, STONE, PLAIN);
  if (x.detail) {
    for (let d = 2; d < span - 2; d += range(rng, 0.8, 1.6)) {
      const t = d / span;
      person(new THREE.Vector3(a.x + (b.x - a.x) * t, y + 0.6, a.z + (b.z - a.z) * t), f.yaw, x.parts, rng);
    }
  }
}
