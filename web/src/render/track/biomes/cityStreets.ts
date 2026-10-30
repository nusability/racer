import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { StreetSection } from '../../../data/tracks/scenery.ts';
import { SURFACE } from '../../facadeStyle.ts';
import type { Corridor } from '../corridor.ts';
import { FENCE_TOP, KERB_H, PAVEMENT, streetFrame } from '../street.ts';
import { tint } from './cityBuilder.ts';
import type { CityParts } from './cityParts.ts';
import type { CitySite, Lot } from './citySite.ts';

// The building line of a street section (scenery.streets): walking each side of the road, lot
// after lot right on the pavement's back edge, each a lit shopfront podium with its district's
// building rising behind it, broken by side streets, a plaza, grandstands and the metro's piers.
// What it lays down (the fronts) is what the street kit (cityStreetKit.ts) dresses.

/** What stands behind a stretch of pavement. */
export type FrontKind = 'shop' | 'side' | 'stand' | 'plaza' | 'open' | 'metro' | 'quay';

export interface Front {
  side: -1 | 1;
  /** Along the section from its start, metres. */
  u0: number;
  u1: number;
  kind: FrontKind;
  /** The lot it stands on (shops and stands). */
  lot?: Lot;
  /** World y of the pavement in front of it. */
  pavement: number;
  /** Shops: the podium's roof, world y. */
  roof?: number;
}

export interface StreetLayout {
  section: StreetSection;
  /** Main-loop s where it starts, and its length. */
  s0: number;
  length: number;
  fronts: Front[];
}

/** The districts the street runs through (cityDistricts.ts). */
export interface Districts {
  /** Builds the district's building on a lot: `ground` is the street level it rises from; false when it cannot. */
  raise(lot: Lot, ground: number, rise: number): boolean;
  /** The district's grime at a point, 0..1. */
  grime(x: number, z: number): number;
}

/** Frontage lots: width along the street and depth back from it, metres. */
const LOT_W: readonly [number, number] = [16, 34];
const LOT_D: readonly [number, number] = [22, 38];
/** Lots stand this close together along the street (an alley between some). */
const LOT_GAP: readonly [number, number] = [0, 2];
/** A side street opens every this many metres, this wide. */
const SIDE_EVERY: readonly [number, number] = [110, 230];
export const SIDE_STREET = 16;
/** A lot's straight front may stand this far off a curving building line before it is narrowed. */
const SAGITTA = 0.8;
/** Where the line will not take a lot, it is tried this much further back, once. */
const SET_BACK = 3;
/** A stretch the line could not build on is skipped this far before trying again, metres. */
const SKIP = 8;
/** The shopfront podium: one tall shop storey, metres. */
const PODIUM_H: readonly [number, number] = [4.9, 6.2];
/** Lowest shopfront worth building: its windows and a strip of fascia (render/facade.ts SHOP_GLASS). */
const PODIUM_LOW = 4;
/** The building rises this far back from the podium's front, so the podium reads as its own storey. */
const TOWER_SETBACK = 2.5;
/** A building over a podium needs a plot at least this wide, its sides at most this far from square (the street grid's own lots are no longer). */
const TOWER_MIN = 14;
const TOWER_ASPECT = 1.4;
/** Frontage height: this share are mid-rise blocks of these heights; the rest towers (shares of the district's tower height). */
const MID_SHARE = 0.6;
const MID_RISE: readonly [number, number] = [16, 44];
const TOWER_RISE: readonly [number, number] = [0.55, 1.05];
/** On a grandstand side this share of lots is a stand instead of a building. */
const STAND_SHARE = 0.3;
/** A plaza leaves the building line open this far either side of its centre; its paved square's radius. */
export const PLAZA_HALF = 70;
export const PLAZA_R = 34;
/** The metro's piers stand in a gap this wide in the building line on both sides; the viaduct runs this far off each side. */
export const METRO_GAP = 18;
export const METRO_RUN = 90;
/** A side street runs this far back from the building line before the city's grid. */
export const SIDE_RUN = 60;
/** Paths kept open for side streets and the viaduct are claimed in pieces this long. */
const CLAIM_STEP = 12;
/** Plinths reach this far under the lowest ground round the lot. */
const PLINTH_SINK = 3;
/** Podium walls: pale render, stone, dark glass, brick (sRGB). */
const PODIUM_TINTS = [0x8a8478, 0x6e6a64, 0x2a3440, 0x5a3a32, 0x7a7a80, 0x4e5058];
const PLINTH = new THREE.Color(0x2a2a30);

export function layStreets(cor: Corridor, sections: StreetSection[], site: CitySite, parts: CityParts, rng: Rng, districts: Districts, keepTowers: number, towerHeight: number): StreetLayout[] {
  const r = cor.ribbon;
  return sections.map((section) => {
    const s0 = r.paramToS(section.from);
    const length = r.wrap(r.paramToS(section.to) - s0);
    const at = (p: number) => r.wrap(r.paramToS(p) - s0);
    const plaza = section.plaza ? { side: section.plaza.side, u: at(section.plaza.at) } : null;
    const metro = section.metro === undefined ? null : at(section.metro);
    const fronts: Front[] = [];
    for (const side of [-1, 1] as const) {
      const pave = (u: number) => streetFrame(cor, Math.round(r.wrap(s0 + u) / r.step), side).foot.y + KERB_H;
      if (section.harbour === side) {
        fronts.push({ side, u0: 0, u1: length, kind: 'quay', pavement: pave(length / 2) });
        continue;
      }
      let nextSide = range(rng, SIDE_EVERY[0], SIDE_EVERY[1]) / 2;
      let u = 0;
      while (u < length) {
        const skip = (kind: FrontKind, to: number) => {
          fronts.push({ side, u0: u, u1: Math.min(length, to), kind, pavement: pave(Math.min(length, (u + to) / 2)) });
          u = to;
        };
        if (plaza && plaza.side === side && u > plaza.u - PLAZA_HALF && u < plaza.u + PLAZA_HALF) {
          const f = streetFrame(cor, Math.round(r.wrap(s0 + plaza.u) / r.step), side);
          const off = PAVEMENT + PLAZA_R + 2;
          site.claim({ x: f.foot.x + f.out.x * off, z: f.foot.z + f.out.z * off, w: 2 * PLAZA_R, d: 2 * PLAZA_R, yaw: 0 });
          skip('plaza', plaza.u + PLAZA_HALF);
          continue;
        }
        if (metro !== null && u > metro - METRO_GAP / 2 && u < metro + METRO_GAP / 2) {
          claimPath(cor, site, s0 + metro, side, METRO_GAP, METRO_RUN);
          skip('metro', metro + METRO_GAP / 2);
          continue;
        }
        if (u >= nextSide) {
          claimPath(cor, site, s0 + u + SIDE_STREET / 2, side, SIDE_STREET, SIDE_RUN);
          skip('side', u + SIDE_STREET);
          nextSide = u + range(rng, SIDE_EVERY[0], SIDE_EVERY[1]);
          continue;
        }
        // The lot ends before the next opening of the line.
        const limits = [length, nextSide];
        if (plaza && plaza.side === side && plaza.u - PLAZA_HALF > u) limits.push(plaza.u - PLAZA_HALF);
        if (metro !== null && metro - METRO_GAP / 2 > u) limits.push(metro - METRO_GAP / 2);
        const room = Math.min(...limits) - u;
        const placed = room >= LOT_W[0] / 2 ? frontLot(cor, s0, u, room, side, rng, site) : null;
        if (!placed) {
          skip('open', u + Math.min(SKIP, Math.max(room, 1)));
          continue;
        }
        const { lot, w } = placed;
        const pavement = pave(u + w / 2);
        const cap = site.roofCap(lot) - pavement;
        // The inside of a bend keeps the road ahead in view: nothing over the fence's height stands there.
        const podium = Math.min(range(rng, PODIUM_H[0], PODIUM_H[1]), Math.max(cap, FENCE_TOP - KERB_H));
        if (podium < PODIUM_LOW) {
          skip('open', u + w);
          continue;
        }
        site.claim(lot);
        if (section.stands === side && rng() < STAND_SHARE) {
          fronts.push({ side, u0: u, u1: u + w, kind: 'stand', lot, pavement });
        } else {
          const roof = pavement + podium;
          const foot = site.footing(lot).lo - PLINTH_SINK;
          parts.add('box', lot.x, foot, lot.z, lot.w, pavement - foot, lot.d, lot.yaw, PLINTH, { surface: SURFACE.plain, grime: 0.5, light: 1, hue: 0, mode: 'steady', trim: 'none', elevated: true });
          const style = { surface: SURFACE.shop, grime: districts.grime(lot.x, lot.z), light: 1, hue: 0 as const, mode: 'steady' as const, trim: 'none' as const, elevated: false };
          parts.add('box', lot.x, pavement, lot.z, lot.w, podium, lot.d, lot.yaw, tint(rng, PODIUM_TINTS), style);
          // The archetypes build on squarish plots: a narrow lot (one on a tight bend) keeps its podium alone.
          const td = Math.min(lot.d - TOWER_SETBACK, (lot.w - TOWER_SETBACK) * TOWER_ASPECT);
          const tw = Math.min(lot.w - TOWER_SETBACK, td * TOWER_ASPECT);
          if (tw >= TOWER_MIN && rng() < keepTowers) {
            const rise = rng() < MID_SHARE ? range(rng, MID_RISE[0], MID_RISE[1]) : towerHeight * range(rng, TOWER_RISE[0], TOWER_RISE[1]);
            // Back from the podium's front, square to the road.
            const back = side * (TOWER_SETBACK + td / 2 - lot.d / 2);
            districts.raise({ ...lot, x: lot.x + Math.sin(lot.yaw) * back, z: lot.z + Math.cos(lot.yaw) * back, d: td, w: tw }, pavement, rise);
          }
          fronts.push({ side, u0: u, u1: u + w, kind: 'shop', lot, pavement, roof });
        }
        u += w + range(rng, LOT_GAP[0], LOT_GAP[1]);
      }
    }
    return { section, s0, length, fronts };
  });
}

/** Keeps the city's grid off a path `w` wide running `run` metres back from the building line at s. */
function claimPath(cor: Corridor, site: CitySite, s: number, side: -1 | 1, w: number, run: number): void {
  const f = streetFrame(cor, Math.round(cor.ribbon.wrap(s) / cor.ribbon.step), side);
  for (let dx = PAVEMENT + w / 2; dx < PAVEMENT + run; dx += CLAIM_STEP) {
    site.claim({ x: f.foot.x + f.out.x * dx, z: f.foot.z + f.out.z * dx, w, d: w, yaw: 0 });
  }
}

/**
 * A frontage lot starting `u` metres into the section on `side`: as wide as the room and the
 * bend allow, its front on the building line (stepped back on the inside of a bend by the
 * curve's bulge), facing the road. Null when the site will not take it here.
 */
function frontLot(cor: Corridor, s0: number, u: number, room: number, side: -1 | 1, rng: Rng, site: CitySite): { lot: Lot; w: number } | null {
  const r = cor.ribbon;
  let w = Math.min(room, range(rng, LOT_W[0], LOT_W[1]));
  const k = Math.round(r.wrap(s0 + u + w / 2) / r.step);
  const smp = r.samples[cor.idx(k)];
  const radius = 1 / Math.max(Math.abs(smp.curvature), 1e-6);
  const inside = Math.sign(smp.curvature) === side;
  // The building line's radius on this side; a straight front spans at most the chord whose bulge is SAGITTA.
  const lineR = Math.max(1, radius + (inside ? -1 : 1) * (smp.width / 2 + PAVEMENT));
  w = Math.min(w, Math.sqrt(8 * lineR * SAGITTA));
  if (w < LOT_W[0] / 2) return null;
  const d = range(rng, LOT_D[0], LOT_D[1]);
  const f = streetFrame(cor, k, side);
  const t = smp.tangent;
  const yaw = Math.atan2(-t.z, t.x);
  for (const back of [inside ? (w * w) / (8 * lineR) : 0, SET_BACK]) {
    const off = PAVEMENT + back + d / 2;
    const lot: Lot = { x: f.foot.x + f.out.x * off, z: f.foot.z + f.out.z * off, w, d, yaw };
    if (site.frontage(lot)) return { lot, w };
  }
  return null;
}
