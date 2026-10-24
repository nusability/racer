// The sky tram: an aerial cable car climbing from a street-level station, over two lattice
// pylons, to a station on the roof of a tower. Lit cabins ride the loop, up one side and down
// the other, swaying on their hangers; the cables are strung with lights and the pylons blink.
// Static parts are merged set-B buckets; the cabins are bones of one set-A rig, placed along the
// cable on the CPU each frame (a handful of matrices).

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { T, beam, box, catenary, mix, pick, shade } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { CONCRETE, CONCRETE_DARK, DARK, Facades, GLASS, NEON, RED_LIGHT, RigKit, STEEL, WALLS, WARM_LIGHT, WHITE } from './kit.ts';

const SALT = 0x5c7a3;
const RADIUS = 170;
/** The line runs along local X from the low station to the tower top. */
const RUN = 300;
const TOP_H = 92;
/** Cable height over each station's floor, and the two pylons: share of the run, height. */
const STATION_CABLE = 11;
const PYLONS: readonly (readonly [number, number])[] = [[0.33, 62], [0.66, 98]];
/** The two cables (up and down) sit this far either side of the line. */
const TRACK = 4;
const SAG = 7;
const SEGS = { high: 14, low: 7 } as const;
/** Cabins on the loop (high, low), their speed (m/s) and size. */
const CABINS = { high: 10, low: 5 } as const;
const SPEED = 8;
const CABIN = 4;
/** Hanger length from the grip to the cabin roof, and the sway (rad, rad/s). */
const HANGER = 3;
const SWAY = 0.08;
const SWAY_RATE = 1.3;
/** Light strung on the cables every n-th point. */
const CABLE_LIGHT_EVERY = 2;

export function createSkyTram(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const x0 = -RUN / 2;
  const x1 = RUN / 2;
  const facades = new Facades();

  // --- Stations: a glazed hall at street level, a rooftop hall on a tower ---
  facades.add(x1 + 6, 0, 0, 34, TOP_H, 30, 0, mix(pick(rng, WALLS), opts.palette.rock, 0.2));
  for (const [x, y] of [[x0, 0], [x1, TOP_H]] as const) {
    kit.solid.add(box(26, 1.2, 22), CONCRETE, T(x, y, 0));
    kit.solid.add(box(26, 12, 0.4), GLASS, T(x, y + 1.2, -11));
    kit.solid.add(box(28, 1.4, 24), DARK, T(x, y + 13, 0));
    kit.lights.add(box(28.2, 0.5, 24.2), NEON[1], T(x, y + 13.4, 0));
    kit.lights.add(box(20, 2, 0.3), shade(WARM_LIGHT, 0.7), T(x, y + 5, -11.3));
    // The bullwheel the cable turns round.
    kit.solid.add(new THREE.TorusGeometry(TRACK, 0.5, 4, 16).rotateX(Math.PI / 2), STEEL, T(x, y + STATION_CABLE, 0));
  }
  kit.solid.add(box(60, 0.3, 40), CONCRETE_DARK, T(x0, 0, 0));

  // --- Pylons: lattice legs to a cross arm carrying both cables, a blinking light on top ---
  const anchors: V3[] = [[x0, STATION_CABLE, 0]];
  for (const [u, hgt] of PYLONS) {
    const x = x0 + RUN * u;
    for (const s of [-1, 1]) {
      kit.solid.add(beam([x - 4, 0, s * 4], [x, hgt, s * 1], 0.5), STEEL);
      kit.solid.add(beam([x + 4, 0, s * 4], [x, hgt, s * 1], 0.5), STEEL);
    }
    for (let y = 10; y < hgt; y += 14) kit.solid.add(box(1, 0.4, 8 * (1 - y / hgt) + 2), STEEL, T(x, y, 0));
    kit.solid.add(box(2, 1.2, TRACK * 2 + 4), STEEL, T(x, hgt, 0));
    kit.lamp(new THREE.OctahedronGeometry(0.7), [x, hgt + 2, 0], RED_LIGHT, 4, undefined, { depth: 0.95, freq: 2.5, phase: u * 9, sharp: 7 });
    anchors.push([x, hgt - 0.5, 0]);
  }
  anchors.push([x1, TOP_H + STATION_CABLE, 0]);

  // --- The cables (up on +Z, down on −Z) and the path the cabins follow along them ---
  const segs = ik.q(SEGS.high, SEGS.low);
  const lanes: V3[][] = [];
  for (const side of [1, -1]) {
    const pts: V3[] = [];
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const run = catenary([a[0], a[1], side * TRACK], [b[0], b[1], side * TRACK], SAG, segs);
      pts.push(...(i === 0 ? run : run.slice(1)));
    }
    for (let i = 0; i + 1 < pts.length; i++) kit.solid.add(beam(pts[i], pts[i + 1], 0.12, 3), DARK);
    pts.forEach((p, i) => {
      if (i % CABLE_LIGHT_EVERY === 0) kit.lamp(new THREE.OctahedronGeometry(0.35), p, mix(NEON[0], 0xffffff, 0.3), 1.8, undefined, { depth: 0.5, freq: 2, phase: i * 0.4, sharp: 1 });
    });
    lanes.push(side > 0 ? pts : [...pts].reverse());
  }
  // One loop: up the first lane, down the second; cumulative length along it.
  const loop = [...lanes[0], ...lanes[1]];
  const cum: number[] = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1], loop[i][2] - loop[i - 1][2]));
  const total = cum[cum.length - 1];

  // --- Cabins: grip, hanger and a lit glass cabin on each bone ---
  const n = ik.q(CABINS.high, CABINS.low);
  const cabins: { bone: THREE.Bone; offset: number }[] = [];
  for (let i = 0; i < n; i++) {
    const bone = rig.bone();
    const body = pick(rng, [WHITE, 0xd8343a, 0x2a6ad8, 0xf2b418]);
    rig.add(box(0.8, 0.8, 0.8), DARK, { bone });
    rig.add(box(0.25, HANGER, 0.25).translate(0, -HANGER / 2, 0), DARK, { bone });
    rig.add(box(CABIN, CABIN * 0.8, CABIN * 0.8), body, { bone, m: T(0, -HANGER - CABIN * 0.8, 0) });
    rig.add(box(CABIN + 0.1, CABIN * 0.32, CABIN * 0.8 + 0.1), mix(GLASS, WARM_LIGHT, 0.55), { bone, layer: 'glow', m: T(0, -HANGER - CABIN * 0.5, 0) });
    rig.add(box(CABIN * 1.05, 0.4, CABIN * 0.85), DARK, { bone, m: T(0, -HANGER, 0) });
    cabins.push({ bone, offset: (i / n) * total });
  }
  facades.build(kit, opts);

  const P = new THREE.Vector3();
  function update(time: number): void {
    for (const c of cabins) {
      const d = (((time * SPEED + c.offset) % total) + total) % total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const a = loop[i - 1];
      const b = loop[i];
      const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      P.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      c.bone.position.copy(P);
      // Sway on the hanger; a cabin is the same both ways round, so it never turns.
      c.bone.rotation.set(Math.sin(time * SWAY_RATE + c.offset) * SWAY, 0, Math.sin(time * SWAY_RATE * 0.7 + c.offset) * SWAY * 0.5);
    }
  }
  return ik.finish(RADIUS, RADIUS, TOP_H + 40, update);
}
