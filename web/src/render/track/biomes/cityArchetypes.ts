import { range } from '../../../core/rng.ts';
import type { CityArchetype } from '../../../data/tracks/scenery.ts';
import { BEACON_HUE, SURFACE, type Surface } from '../../facadeStyle.ts';
import { Builder, onX, opposite, tint, type Face } from './cityBuilder.ts';

// The city's building archetypes, each its own silhouette from the kit shapes and its own
// surfaces from the facade shader. Each lays itself out in its plot (cityBuilder.ts) from the
// height the plot asks of it and returns false when the plot leaves it too little to build.

/** Wall tints (sRGB): dark and mirrored glass, concrete clean and grimy, brick, steel, rust, pastels, stone, patchwork. */
const GLASS_DARK = [0x1a2433, 0x202c40, 0x182a30, 0x262640, 0x1c2228];
const GLASS_MIRROR = [0x2c4560, 0x34506a, 0x284450, 0x3a3a5a];
const CONCRETE = [0x5c5c62, 0x52525a, 0x66625c, 0x4e5058];
const GRIMY = [0x4a463e, 0x423e3a, 0x504840, 0x3e3c3a];
const BRICK = [0x5a3a32, 0x4c3430, 0x603e2e];
const STEEL = [0x5a5e68, 0x4a4e58, 0x3e424c];
const RUST = [0x6a4030, 0x5a3a2a, 0x704a32, 0x4e3428];
const PASTEL = [0x8a8a9a, 0x7a8a96, 0x9a8a80, 0x6a7a8a, 0x8a7a92];
const STONE = [0x8a8478, 0x7a7468, 0x948c7c];
const PATCH = [0x3a5a5a, 0x6a4a30, 0x5a5a3a, 0x4a3a5a, 0x7a6a50, 0x404850];
const CRANE = [0xb08a2a, 0x9a7a28];
const MAST = [0x6a6e78];

/** Height spread of each archetype: shares of the height its plot asks. */
const RISE: Record<CityArchetype, readonly [number, number]> = {
  spire: [1.1, 1.6],
  twist: [1.0, 1.4],
  monolith: [0.9, 1.2],
  ziggurat: [0.55, 0.85],
  arcology: [1.0, 1.5],
  dome: [0.6, 0.95],
  skybridge: [0.85, 1.2],
  residential: [0.75, 1.05],
  capsule: [0.6, 0.95],
  industrial: [0.7, 1.05],
  slab: [0.7, 1.0],
  shanty: [0.85, 1.15],
  shell: [0.7, 1.0],
};

/** Archetypes that may also take a whole street block as one megastructure. */
export const BLOCK_SCALE: ReadonlySet<CityArchetype> = new Set(['ziggurat', 'arcology', 'skybridge', 'industrial']);

type Build = (k: Builder) => boolean;

/** Sky bridges: a glazed deck this tall (m), only between towers at least this tall (m). */
const BRIDGE_H = 4;
const BRIDGE_MIN = 30;
/** AC units hung on each long face of a slab (a range). */
const AC_UNITS: readonly [number, number] = [6, 14];
/** A plant hall rises no higher than this (m); its stacks carry the height. */
const HALL_MAX = 110;
/** A stack stands at least this far over its hall's roof (m), or is left off. */
const MIN_STACK = 8;
/** Roof clutter (tanks, shacks, vents) needs this much headroom under the cap, metres. */
const CLUTTER_ROOM = 2;
/** The crane needs a shell at least this tall to stand on and over, metres. */
const CRANE_MIN = 40;

/** Supertall in mirrored glass: setback tiers (some round), a glass crown and a beacon mast. */
const spire: Build = (k) => {
  const H = k.height(RISE.spire);
  if (!H) return false;
  const round = k.rng() < 0.3;
  const glass = tint(k.rng, GLASS_MIRROR);
  const tiers = k.rng() < 0.5 ? 3 : 4;
  const crownH = H * 0.12;
  const mastH = H * 0.1;
  const bodyH = H - crownH - mastH;
  let s = Math.min(k.p.w, k.p.d) * range(k.rng, 0.72, 0.9);
  let from = k.p.base;
  let top = k.p.ground;
  const trim = k.autoTrim();
  for (let t = 0; t < tiers; t++) {
    top += bodyH * (t === 0 ? 0.5 : 0.5 / (tiers - 1));
    k.put(round ? 'cylinder' : 'box', 0, from, 0, s, top - from, s, glass, k.look(SURFACE.curtain, { trim, elevated: t > 0 }));
    from = top;
    s *= 0.8;
  }
  // A dome's crown is as high as it is wide allows; the mast stands where the crown narrows.
  const crown = round ? Math.min(crownH, s * 0.6) : crownH;
  if (round) k.put('dome', 0, top, 0, s * 1.2, crown * 2, s * 1.2, glass, k.look(SURFACE.curtain, { elevated: true }));
  else k.put('spire', 0, top, 0, s * 1.2, crown, s * 1.2, glass, k.look(SURFACE.curtain, { trim: 'edges', elevated: true }));
  k.mast(0, top + crown * 0.85, 0, mastH, tint(k.rng, MAST));
  return true;
};

/** A tower turning a quarter turn as it narrows, on a podium, neon up its twisting corners. */
const twist: Build = (k) => {
  const H = k.height(RISE.twist);
  if (!H) return false;
  const m = Math.min(k.p.w, k.p.d);
  const podium = Math.min(H * 0.12, 18);
  k.put('box', 0, k.p.base, 0, k.p.w * 0.92, k.y(podium) - k.p.base, k.p.d * 0.92, tint(k.rng, CONCRETE), k.look(SURFACE.ribbon, { trim: 'crown' }));
  // Its corners swing out to s/√2 as it turns: keep that inside the plot.
  const s = m * range(k.rng, 0.56, 0.68);
  const bodyTop = H * 0.9;
  k.put('twist', 0, k.y(podium), 0, s, bodyTop - podium, s, tint(k.rng, k.rng() < 0.5 ? GLASS_MIRROR : GLASS_DARK), k.look(SURFACE.curtain, { trim: k.rng() < 0.4 + k.p.neon ? 'edges' : 'none', elevated: true }), k.rng() * Math.PI);
  k.mast(0, k.y(bodyTop), 0, H - bodyTop, tint(k.rng, MAST));
  return true;
};

/** A dark corporate slab, its wide face to the course carrying a giant holo-ad. */
const monolith: Build = (k) => {
  const H = k.height(RISE.monolith);
  if (!H) return false;
  const f = k.p.face;
  const wide = (onX(f) ? k.p.d : k.p.w) * 0.9;
  const thick = (onX(f) ? k.p.w : k.p.d) * range(k.rng, 0.3, 0.42);
  const [hw, hd] = onX(f) ? [thick / 2, wide / 2] : [wide / 2, thick / 2];
  k.put('box', 0, k.p.base, 0, hw * 2, k.y(H) - k.p.base, hd * 2, tint(k.rng, GLASS_DARK), k.look(SURFACE.curtain, { trim: 'crown', light: 0.45 }));
  const adH = H * range(k.rng, 0.28, 0.42);
  const adW = wide * range(k.rng, 0.62, 0.8);
  const holo = k.look(SURFACE.holo, { elevated: true, mode: k.grime > 0.6 ? 'flicker' : 'steady' });
  k.panel(f, hw, hd, 0, k.y(H * 0.92 - adH), adW, adH, holo);
  if (k.rng() < 0.5) k.panel(opposite(f), hw, hd, range(k.rng, -0.5, 0.5), k.y(H * range(k.rng, 0.2, 0.5)), adW * 0.5, adH * 0.5, k.look(SURFACE.sign, { elevated: true }));
  k.mast(hw * 0.5, k.y(H), hd * 0.6, H * 0.12, tint(k.rng, MAST));
  k.mast(-hw * 0.5, k.y(H), -hd * 0.6, H * 0.08, tint(k.rng, MAST));
  return true;
};

/** A stepped megablock with a sky garden on every terrace and a pad or dome on top. */
const ziggurat: Build = (k) => {
  const H = k.height(RISE.ziggurat);
  if (!H) return false;
  const tiers = 4 + Math.floor(k.rng() * 3);
  // Each terrace steps in by a share of the plot that leaves the top tier a third of the base or more.
  const step = (Math.min(k.p.w, k.p.d) * range(k.rng, 0.26, 0.34)) / tiers;
  const wall = tint(k.rng, k.rng() < 0.5 ? STONE : CONCRETE);
  const surface: Surface = k.rng() < 0.6 ? SURFACE.ribbon : SURFACE.office;
  const trim = k.autoTrim();
  const tierH = (H * 0.92) / tiers;
  let w = k.p.w * 0.96;
  let d = k.p.d * 0.96;
  let from = k.p.base;
  let top = k.p.ground;
  for (let t = 0; t < tiers; t++) {
    top += tierH;
    k.put('box', 0, from, 0, w, top - from, d, wall, k.look(surface, { trim, elevated: t > 0 }));
    w -= 2 * step;
    d -= 2 * step;
    if (t < tiers - 1) k.put('box', 0, top, 0, w + step, Math.min(1.4, k.room(top)), d + step, wall, k.look(SURFACE.garden, { elevated: true }));
    from = top;
  }
  const cap = H - tierH * tiers;
  if (k.rng() < 0.5) k.put('box', 0, top, 0, w * 0.7, cap * 0.25, d * 0.7, tint(k.rng, STEEL), k.look(SURFACE.pad, { elevated: true }));
  else k.put('dome', 0, top, 0, Math.min(w, d) * 0.7, cap * 2, Math.min(w, d) * 0.7, tint(k.rng, GLASS_MIRROR), k.look(SURFACE.curtain, { elevated: true }));
  return true;
};

/** A city in a tower: a podium, a round core girdled by lit rings, a landing pad cantilevered off it, an antenna crown. */
const arcology: Build = (k) => {
  const H = k.height(RISE.arcology);
  if (!H) return false;
  const m = Math.min(k.p.w, k.p.d);
  const podium = H * range(k.rng, 0.16, 0.24);
  k.put('box', 0, k.p.base, 0, k.p.w * 0.95, k.y(podium) - k.p.base, k.p.d * 0.95, tint(k.rng, CONCRETE), k.look(SURFACE.ribbon, { trim: 'crown' }));
  const c = m * range(k.rng, 0.46, 0.58);
  const coreTop = H * 0.8;
  const glass = tint(k.rng, k.rng() < 0.5 ? GLASS_MIRROR : GLASS_DARK);
  k.put('cylinder', 0, k.y(podium), 0, c, coreTop - podium, c, glass, k.look(k.rng() < 0.5 ? SURFACE.curtain : SURFACE.office, { elevated: true }));
  // Lit rings round the core.
  for (const at of [0.45, 0.7]) {
    const y = k.y(podium + (coreTop - podium) * at);
    k.put('cylinder', 0, y, 0, c * 1.1, 3, c * 1.1, tint(k.rng, STEEL), k.look(SURFACE.plain, { trim: 'crown', mode: 'steady', elevated: true }));
  }
  // The pad: out from the core toward a side of the plot, as far as the plot allows.
  const along = k.rng() < 0.5;
  const reach = (along ? k.p.w : k.p.d) / 2 - 1;
  const len = Math.min(reach - c / 2 + 4, 26);
  const padY = k.y(podium + (coreTop - podium) * range(k.rng, 0.55, 0.85));
  const mid = c / 2 - 4 + len / 2;
  const wide = Math.min((along ? k.p.d : k.p.w) * 0.8, 20);
  const pad = k.look(SURFACE.pad, { elevated: true, hue: 1 });
  if (len > 8) {
    if (along) k.put('box', mid, padY, 0, len, 1.6, wide, tint(k.rng, STEEL), pad);
    else k.put('box', 0, padY, mid, wide, 1.6, len, tint(k.rng, STEEL), pad);
  }
  const domeH = Math.min(c * 0.3, H * 0.07);
  k.put('dome', 0, k.y(coreTop), 0, c * 0.9, domeH * 2, c * 0.9, glass, k.look(SURFACE.curtain, { elevated: true }));
  const crown = k.y(coreTop + domeH * 0.6);
  k.mast(0, crown, 0, H - coreTop, tint(k.rng, MAST));
  k.mast(c * 0.22, crown - domeH * 0.3, 0, (H - coreTop) * 0.6, tint(k.rng, MAST));
  k.mast(-c * 0.18, crown - domeH * 0.3, c * 0.12, (H - coreTop) * 0.45, tint(k.rng, MAST));
  return true;
};

/** A civic tower under a glass dome: a stone base (or none, for a hall), a lit drum, a lantern. */
const dome: Build = (k) => {
  const H = k.height(RISE.dome);
  if (!H) return false;
  const m = Math.min(k.p.w, k.p.d);
  const hall = k.rng() < 0.35;
  const stone = tint(k.rng, STONE);
  const baseH = hall ? 0 : H * range(k.rng, 0.35, 0.55);
  const dd = m * (hall ? 0.88 : 0.68);
  if (!hall) k.put('box', 0, k.p.base, 0, m * 0.8, k.y(baseH) - k.p.base, m * 0.8, stone, k.look(SURFACE.office, {}));
  const drumH = H * (hall ? 0.45 : 0.18);
  k.put('cylinder', 0, hall ? k.p.base : k.y(baseH), 0, dd, k.y(baseH + drumH) - (hall ? k.p.base : k.y(baseH)), dd, stone, k.look(SURFACE.ribbon, { trim: 'crown', elevated: !hall }));
  const domeH = Math.min(dd * 0.5, H - baseH - drumH);
  const y = k.y(baseH + drumH);
  k.put('dome', 0, y, 0, dd, domeH * 2, dd, tint(k.rng, GLASS_MIRROR), k.look(SURFACE.curtain, { elevated: true, light: 1.4 }));
  k.mast(0, y + domeH * 0.9, 0, H - baseH - drumH - domeH * 0.9, tint(k.rng, MAST));
  return true;
};

/** Towers on one plot linked by glazed bridges at several heights. */
const skybridge: Build = (k) => {
  const H = k.height(RISE.skybridge);
  if (!H) return false;
  // Two in a row along the plot's longer side, or four in a square on a big plot.
  const big = Math.min(k.p.w, k.p.d) > 70;
  const cells: [number, number][] = big
    ? [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]
    : k.p.w > k.p.d
      ? [
          [-1, 0],
          [1, 0],
        ]
      : [
          [0, -1],
          [0, 1],
        ];
  const cw = big || k.p.w > k.p.d ? k.p.w / 2 : k.p.w;
  const cd = big || k.p.w <= k.p.d ? k.p.d / 2 : k.p.d;
  const glass = tint(k.rng, k.rng() < 0.5 ? GLASS_MIRROR : GLASS_DARK);
  const trim = k.autoTrim();
  const towers = cells.map(([i, j]) => {
    const s = Math.min(cw, cd) * range(k.rng, 0.55, 0.72);
    const h = H * range(k.rng, 0.62, 1);
    const x = (i * cw) / 2;
    const z = (j * cd) / 2;
    k.put(k.rng() < 0.3 ? 'cylinder' : 'box', x, k.p.base, z, s, k.y(h) - k.p.base, s, glass, k.look(k.rng() < 0.6 ? SURFACE.curtain : SURFACE.office, { trim }));
    k.mast(x, k.y(h), z, H * 0.08, tint(k.rng, MAST));
    return { x, z, s, h };
  });
  const bridge = k.look(SURFACE.ribbon, { elevated: true, trim: 'crown', light: 1.4 });
  for (let t = 0; t < towers.length; t++) {
    const a = towers[t];
    const b = towers[(t + 1) % towers.length];
    if (towers.length === 2 && t === 1) break;
    const lo = Math.min(a.h, b.h);
    if (lo < BRIDGE_MIN) continue;
    for (let n = 0; n < 1 + Math.floor(k.rng() * 3); n++) {
      const y = k.y(Math.min(lo * range(k.rng, 0.3, 0.85), lo - 2 * BRIDGE_H));
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const z0 = Math.min(a.z, b.z);
      const z1 = Math.max(a.z, b.z);
      const deck = range(k.rng, 4, 7);
      if (x1 - x0 > z1 - z0) k.put('box', (x0 + x1) / 2, y, a.z, x1 - x0, BRIDGE_H, deck, tint(k.rng, STEEL), bridge);
      else k.put('box', a.x, y, (z0 + z1) / 2, deck, BRIDGE_H, z1 - z0, tint(k.rng, STEEL), bridge);
    }
  }
  return true;
};

/** Balconied flats, sometimes twin towers, a water tank and a sign. */
const residential: Build = (k) => {
  const H = k.height(RISE.residential);
  if (!H) return false;
  const wall = tint(k.rng, k.rng() < 0.6 ? CONCRETE : BRICK);
  const twin = k.rng() < 0.35;
  const w = k.p.w * range(k.rng, 0.68, 0.82);
  const d = k.p.d * range(k.rng, 0.6, 0.78);
  const trim = k.autoTrim();
  const bodies: [number, number, number, number][] = twin
    ? [
        [-w / 4 - 1.5, 0, w / 2 - 3, H],
        [w / 4 + 1.5, 0, w / 2 - 3, H * range(k.rng, 0.75, 1)],
      ]
    : [[0, 0, w, H]];
  for (const [x, z, bw, h] of bodies) {
    k.put('box', x, k.p.base, z, bw, k.y(h) - k.p.base, d, wall, k.look(SURFACE.balcony, { trim }));
    if (k.p.detail && k.room(k.y(h)) >= CLUTTER_ROOM) k.put('cylinder', x + bw * 0.2, k.y(h), z, 4, Math.min(5, k.room(k.y(h))), 4, tint(k.rng, STEEL), k.look(SURFACE.plain, { elevated: true }));
  }
  if (k.rng() < k.p.neon) k.blade(k.p.face, w / 2, d / 2, range(k.rng, -1, 1), k.y(range(k.rng, 4, H * 0.4)));
  return true;
};

/** Capsule-hotel modules stacked off true, each its own colour, a tall sign down one corner. */
const capsule: Build = (k) => {
  const H = k.height(RISE.capsule);
  if (!H) return false;
  const trim = k.autoTrim();
  let y = k.p.base;
  let first = true;
  let foot: [number, number, number, number] | null = null;
  while (y < k.y(H) - 4) {
    const mw = k.p.w * range(k.rng, 0.5, 0.68);
    const md = k.p.d * range(k.rng, 0.5, 0.68);
    const ox = range(k.rng, -1, 1) * (k.p.w - mw) * 0.45;
    const oz = range(k.rng, -1, 1) * (k.p.d - md) * 0.45;
    const top = Math.min(k.y(H), (first ? k.p.ground : y) + range(k.rng, 9, 15));
    k.put('box', ox, y, oz, mw, top - y, md, tint(k.rng, PASTEL), k.look(SURFACE.capsule, { trim, elevated: !first }));
    foot ??= [ox, oz, mw / 2, md / 2];
    y = top;
    first = false;
  }
  // A tall sign down the street-level module's corner.
  if (foot) k.blade(k.p.face, foot[2], foot[3], 1, k.y(3), undefined, foot[0], foot[1]);
  return true;
};

/** A clad plant hall with stacks (beacons or a hot glow at the lip), tanks, vents and pipes. */
const industrial: Build = (k) => {
  const H = k.height(RISE.industrial);
  if (!H) return false;
  const hallH = Math.min(H * range(k.rng, 0.5, 0.8), HALL_MAX);
  const w = k.p.w * 0.9;
  const d = k.p.d * 0.85;
  k.put('box', 0, k.p.base, 0, w, k.y(hallH) - k.p.base, d, tint(k.rng, k.rng() < 0.5 ? STEEL : RUST), k.look(SURFACE.industrial, { trim: 'crown', hue: 2, mode: 'steady' }));
  const roof = k.y(hallH);
  // Stacks carry the plant's height over the hall; no room over it, no stacks.
  const stacks = H - hallH < MIN_STACK ? 0 : 1 + Math.floor(k.rng() * 3);
  const tops: [number, number, number][] = [];
  for (let i = 0; i < stacks; i++) {
    const r = range(k.rng, 3.5, 6);
    const x = range(k.rng, -1, 1) * (w / 2 - r);
    const z = range(k.rng, -1, 1) * (d / 2 - r);
    const top = k.y(hallH + (H - hallH) * range(k.rng, 0.45, 1));
    const hot = k.rng() < 0.5;
    k.put('cylinder', x, roof - 1, z, r, top - roof + 1, r, tint(k.rng, BRICK), k.look(SURFACE.plain, { trim: 'crown', hue: hot ? 2 : BEACON_HUE, mode: hot ? 'steady' : 'flicker', elevated: true }));
    tops.push([x, roof + 3, z]);
  }
  const tanks = 1 + Math.floor(k.rng() * 2);
  for (let i = 0; i < tanks; i++) {
    const r = Math.min(range(k.rng, 8, 14), d * 0.4);
    const x = range(k.rng, -1, 1) * (w / 2 - r / 2);
    const z = range(k.rng, -1, 1) * (d / 2 - r / 2);
    k.put('cylinder', x, roof - 1, z, r, Math.min(range(k.rng, 8, 16), k.room(roof)), r, tint(k.rng, STEEL), k.look(SURFACE.plain, { elevated: true }));
  }
  if (k.p.detail) {
    for (let i = 0; i < 2 + Math.floor(k.rng() * 4); i++) {
      const vw = range(k.rng, 3, 6);
      k.put('box', range(k.rng, -1, 1) * (w / 2 - vw), roof - 0.5, range(k.rng, -1, 1) * (d / 2 - vw), vw, Math.min(range(k.rng, 2, 4), k.room(roof)), vw, tint(k.rng, STEEL), k.look(SURFACE.plain, { elevated: true }));
    }
    for (let i = 1; i < tops.length; i++) k.beam(tops[i - 1], tops[i], 1.2, 1.2, tint(k.rng, RUST), k.look(SURFACE.plain, { elevated: true }));
  }
  return true;
};

/** A long grimy concrete slab hung with AC units, a clutter of shacks and masts on the roof, a failing sign. */
const slab: Build = (k) => {
  const H = k.height(RISE.slab);
  if (!H) return false;
  const long = onX(k.p.face);
  const w = k.p.w * (long ? range(k.rng, 0.55, 0.68) : range(k.rng, 0.8, 0.9));
  const d = k.p.d * (long ? range(k.rng, 0.8, 0.9) : range(k.rng, 0.55, 0.68));
  const grime = k.grime + 0.2;
  k.put('box', 0, k.p.base, 0, w, k.y(H) - k.p.base, d, tint(k.rng, GRIMY), k.look(SURFACE.slab, { grime }));
  const roof = k.y(H);
  if (k.p.detail) {
    // AC units on the faces toward and away from the course.
    for (const f of [k.p.face, opposite(k.p.face)]) {
      const [hw, hd] = [w / 2, d / 2];
      const span = onX(f) ? hd : hw;
      for (let i = 0; i < AC_UNITS[0] + Math.floor(k.rng() * (AC_UNITS[1] - AC_UNITS[0])); i++) {
        const a = range(k.rng, -1, 1) * (span - 1);
        const y = k.y(range(k.rng, 5, H - 4));
        const out = f === 0 ? hw + 0.4 : f === 1 ? -hw - 0.4 : 0;
        const outZ = f === 2 ? hd + 0.4 : f === 3 ? -hd - 0.4 : 0;
        if (onX(f)) k.put('box', out, y, a, 0.8, 1, 1.4, tint(k.rng, CONCRETE), k.look(SURFACE.plain, { elevated: true, grime }));
        else k.put('box', a, y, outZ, 1.4, 1, 0.8, tint(k.rng, CONCRETE), k.look(SURFACE.plain, { elevated: true, grime }));
      }
    }
    for (let i = 0; i < 2 + Math.floor(k.rng() * 3) && k.room(roof) >= CLUTTER_ROOM; i++) {
      const sw = range(k.rng, 3, 7);
      k.put('box', range(k.rng, -1, 1) * (w / 2 - sw / 2), roof, range(k.rng, -1, 1) * (d / 2 - sw / 2), sw, Math.min(range(k.rng, 2.5, 4), k.room(roof)), sw, tint(k.rng, PATCH), k.look(SURFACE.plain, { elevated: true, grime }));
    }
    k.mast(range(k.rng, -0.3, 0.3) * w, roof, range(k.rng, -0.3, 0.3) * d, H * 0.15, tint(k.rng, MAST));
  }
  const dead = k.rng() < 0.5 ? 'dead' : 'flicker';
  k.blade(k.p.face, w / 2, d / 2, range(k.rng, -1, 1), k.y(range(k.rng, 4, H * 0.6)), dead);
  if (k.rng() < k.p.neon) k.blade(k.p.face, w / 2, d / 2, range(k.rng, -1, 1), k.y(range(k.rng, 4, H * 0.3)));
  return true;
};

/** A tower crusted with cantilevered add-on boxes, a shack pile on the roof, cables and failing signs. */
const shanty: Build = (k) => {
  const H = k.height(RISE.shanty);
  if (!H) return false;
  const w = k.p.w * range(k.rng, 0.5, 0.6);
  const d = k.p.d * range(k.rng, 0.5, 0.6);
  k.put('box', 0, k.p.base, 0, w, k.y(H) - k.p.base, d, tint(k.rng, GRIMY), k.look(k.rng() < 0.6 ? SURFACE.slab : SURFACE.office, { grime: k.grime + 0.15 }));
  const roof = k.y(H);
  const boxes = k.p.detail ? 6 + Math.floor(k.rng() * 8) : 4;
  const surfaces: Surface[] = [SURFACE.slab, SURFACE.capsule, SURFACE.plain, SURFACE.industrial];
  const ends: [number, number, number][] = [];
  for (let i = 0; i < boxes; i++) {
    const f = Math.floor(k.rng() * 4) as Face;
    const margin = onX(f) ? k.p.w / 2 - w / 2 : k.p.d / 2 - d / 2;
    const out = Math.min(range(k.rng, 3, 9), margin - 0.2);
    if (out < 2) continue;
    const bw = range(k.rng, 6, 12);
    const bh = Math.min(range(k.rng, 4, 9), H * 0.3);
    if (H - bh - 1 < 4) continue;
    const y = k.y(range(k.rng, 4, H - bh - 1));
    const span = (onX(f) ? d : w) / 2 - bw / 2;
    const a = range(k.rng, -1, 1) * span;
    const sign = f === 0 || f === 2 ? 1 : -1;
    const style = k.look(surfaces[Math.floor(k.rng() * surfaces.length)], { elevated: true, grime: k.grime + 0.1 });
    // Sunk half a metre into the wall it clings to.
    const c = sign * ((onX(f) ? w : d) / 2 + out / 2 - 0.5);
    if (onX(f)) k.put('box', c, y, a, out + 1, bh, bw, tint(k.rng, PATCH), style);
    else k.put('box', a, y, c, bw, bh, out + 1, tint(k.rng, PATCH), style);
    ends.push(onX(f) ? [c + sign * (out / 2), y + bh, a] : [a, y + bh, c + sign * (out / 2)]);
  }
  for (let i = 0; i < (k.p.detail ? 4 : 1); i++) {
    const sw = range(k.rng, 4, 8);
    const sy = roof + i * 3;
    if (k.room(sy) < 3) break;
    k.put('box', range(k.rng, -1, 1) * (w / 2 - sw / 2), sy, range(k.rng, -1, 1) * (d / 2 - sw / 2), sw, 3, sw, tint(k.rng, PATCH), k.look(SURFACE.capsule, { elevated: true }));
  }
  if (k.p.detail) {
    // Cables from the add-ons up to the roof's edge.
    for (const e of ends.slice(0, 6)) {
      const to: [number, number, number] = [Math.sign(e[0]) * w * 0.45, Math.min(roof, e[1] + range(k.rng, 6, 20)), Math.sign(e[2]) * d * 0.45];
      k.beam(e, to, 0.3, 0.3, tint(k.rng, STEEL), k.look(SURFACE.plain, { elevated: true }));
    }
  }
  for (let i = 0; i < 1 + Math.floor(k.rng() * 3); i++) k.blade(Math.floor(k.rng() * 4) as Face, w / 2, d / 2, range(k.rng, -1, 1), k.y(range(k.rng, 4, H * 0.7)));
  return true;
};

/** A half-built shell: finished floors under a frame in scaffold mesh, a crane over it. */
const shell: Build = (k) => {
  const H = k.height(RISE.shell);
  if (!H) return false;
  const w = k.p.w * range(k.rng, 0.7, 0.82);
  const d = k.p.d * range(k.rng, 0.7, 0.82);
  const done = H * range(k.rng, 0.2, 0.45);
  const frameTop = H * 0.72;
  k.put('box', 0, k.p.base, 0, w, k.y(done) - k.p.base, d, tint(k.rng, CONCRETE), k.look(SURFACE.office, { light: 0.4 }));
  k.put('box', 0, k.y(done), 0, w, frameTop - done, d, tint(k.rng, CONCRETE), k.look(SURFACE.shell, { elevated: true }));
  if (H < CRANE_MIN) return true;
  // The crane: a mast inside one corner, its jib reaching across the shell to the plot's far
  // side, a short counter-jib with its weight behind the mast, a beacon on top.
  const side = k.rng() < 0.5 ? -1 : 1;
  const mx = (w / 2 - 3) * side;
  const mz = (d / 2 - 3) * (k.rng() < 0.5 ? -1 : 1);
  const mastTop = H - 3;
  const yellow = tint(k.rng, CRANE);
  const steel = k.look(SURFACE.plain, { elevated: true });
  k.put('box', mx, k.y(frameTop), mz, 2.4, mastTop - frameTop, 2.4, yellow, steel);
  const far = -side * (k.p.w / 2 - 1);
  const back = mx + side * Math.min(6, k.p.w / 2 - Math.abs(mx) - 0.5);
  k.put('box', (far + back) / 2, k.y(mastTop), mz, Math.abs(far - back), 1.8, 1.8, yellow, steel);
  k.put('box', (mx + back) / 2, k.y(mastTop) - 2.5, mz, Math.max(1, Math.abs(back - mx)), 2.5, 3, tint(k.rng, CONCRETE), steel);
  k.mast(mx, k.y(mastTop) + 1.8, mz, 6, yellow);
  return true;
};

export const ARCHETYPES: Record<CityArchetype, Build> = { spire, twist, monolith, ziggurat, arcology, dome, skybridge, residential, capsule, industrial, slab, shanty, shell };
