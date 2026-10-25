import * as THREE from 'three';
import type { Corridor } from '../corridor.ts';
import { StationMesh } from './stationMesh.ts';
import { light, type Lights } from './spaceStation.ts';

// Gantries spanning the open deck: lattice legs standing just outside the hard boundary (tied
// back under the deck), a lattice beam close overhead, light panels on its face toward the
// racers (chevrons scrolling with the race, segment bars filling: light, no text), a band of
// light under it and strips up the legs. All of them one station mesh: they line the road, so
// they are in view together.

/** Gantries over the open deck: spacing, clear height over the road, and how far outside the boundary their legs stand. */
const GATE_SPACING = 64;
const GATE_HEIGHT = 10;
const GATE_LEG_GAP = 1.6;
/** The lattices: leg and beam section, bay, member (m). Only the faces racers see head-on are braced. */
const LEG = 1.8;
const BEAM = 2.4;
const BAY = 3.2;
const MEMBER = 0.22;
/** Legs reach under the deck's underside (render/track/deck.ts: 1.6 m deep), tied to it by an outrigger. */
const GATE_FOOT = -2.4;
const OUTRIGGER: readonly [number, number] = [-1.5, -0.6];
/** Light panels on the beam's face: the centre panel's share of the span, the side panels', and their height (m). */
const PANEL_SHARE = 0.36;
const SIDE_PANEL_SHARE = 0.14;
const PANEL_HEIGHT = 1.5;
/** Light (HDR): the band under the beam and the strips up the legs, cool white; panels in the accent. */
const GATE_LIGHT = new THREE.Color(1.9, 2.1, 2.3);
const PANEL_GAIN = 2.2;
const LEG_STRIP = 0.3;
/** Paint (sRGB). */
const STEEL = 0x4a505a;
const BEACON = new THREE.Color(3, 0.25, 0.15);
const BEACON_SIZE = 1.6;
const FLOOD = new THREE.Color(2.4, 1.8, 1.1);
const FLOOD_SIZE = 1.4;

/** A point in the road frame of sample k: lateral x, height y, ds metres along. */
function roadPoint(cor: Corridor, k: number, x: number, y: number, ds: number): THREE.Vector3 {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const p = cor.banked(k, x, y);
  return new THREE.Vector3(p.x + smp.tangent.x * ds, p.y + smp.tangent.y * ds, p.z + smp.tangent.z * ds);
}

/** Gantries over each main-road span [s0, s1] (see the header), as one mesh; null when none fit. */
export function gantries(cor: Corridor, spans: readonly (readonly [number, number])[], lights: Lights): StationMesh | null {
  const r = cor.ribbon;
  const mesh = new StationMesh();
  let n = 0;
  const stations: number[] = [];
  for (const [s0, s1] of spans) for (let s = s0; s <= s1; s += GATE_SPACING) stations.push(s);
  for (const s of stations) {
    const k = cor.idx(Math.round(s / r.step));
    if (cor.tunnel(k) || cor.gap(k) || cor.junction(k) || cor.open(k, -1) || cor.open(k, 1)) continue;
    const smp = r.samples[k];
    const up = new THREE.Vector3(smp.up.x, smp.up.y, smp.up.z);
    const fwd = new THREE.Vector3(smp.tangent.x, smp.tangent.y, smp.tangent.z);
    const right = new THREE.Vector3(smp.right.x, smp.right.y, smp.right.z);
    const P = (x: number, y: number, ds = 0) => roadPoint(cor, k, x, y, ds);
    const xl = -cor.edge(k, -1) - GATE_LEG_GAP - LEG / 2;
    const xr = cor.edge(k, 1) + GATE_LEG_GAP + LEG / 2;
    const top = GATE_HEIGHT + BEAM;
    mesh.paint('steel', STEEL, n);
    for (const x of [xl, xr]) {
      mesh.truss(P(x, GATE_FOOT), P(x, top), LEG, BAY, MEMBER, fwd, 'y');
      // Tied back under the deck so the leg stands on something.
      const side = Math.sign(x);
      mesh.beam(P(x, (OUTRIGGER[0] + OUTRIGGER[1]) / 2), P(side * cor.edge(k, side > 0 ? 1 : -1), (OUTRIGGER[0] + OUTRIGGER[1]) / 2), LEG * 0.6, OUTRIGGER[1] - OUTRIGGER[0], up);
    }
    mesh.truss(P(xl - LEG / 2, GATE_HEIGHT + BEAM / 2), P(xr + LEG / 2, GATE_HEIGHT + BEAM / 2), BEAM, BAY, MEMBER * 1.2, up, 'x');
    // Light panels on the face toward the racers coming (-fwd), held just off the lattice.
    const face = -BEAM / 2 - 0.15;
    const towardRacers = fwd.clone().negate();
    const span = xr - xl;
    const panel = (x0: number, x1: number, seed: number) => {
      const y0 = GATE_HEIGHT + (BEAM - PANEL_HEIGHT) / 2;
      mesh.paint('sign', cor.paint.accent.clone().multiplyScalar(PANEL_GAIN), seed, false).face(P(x0, y0, face), P(x1, y0, face), P(x1, y0 + PANEL_HEIGHT, face), P(x0, y0 + PANEL_HEIGHT, face), towardRacers, [x0 - (x0 + x1) / 2, -PANEL_HEIGHT / 2]);
      // The panel's back, so it is a solid board from behind.
      mesh.paint('steel', STEEL, n).face(P(x0, y0, face - 0.1), P(x1, y0, face - 0.1), P(x1, y0 + PANEL_HEIGHT, face - 0.1), P(x0, y0 + PANEL_HEIGHT, face - 0.1), fwd);
    };
    panel(-(span * PANEL_SHARE) / 2, (span * PANEL_SHARE) / 2, 2 * n);
    for (const sx of [-1, 1]) {
      const c = sx * span * (PANEL_SHARE / 2 + SIDE_PANEL_SHARE / 2 + 0.04);
      panel(c - (span * SIDE_PANEL_SHARE) / 2, c + (span * SIDE_PANEL_SHARE) / 2, 2 * n + 1);
    }
    // A band of light under the beam, strips up the legs' inner faces.
    const down = up.clone().negate();
    const under = GATE_HEIGHT - MEMBER;
    mesh.paint('glow', GATE_LIGHT, 0, false).face(P(xl, under, -BEAM * 0.3), P(xr, under, -BEAM * 0.3), P(xr, under, BEAM * 0.3), P(xl, under, BEAM * 0.3), down);
    for (const x of [xl, xr]) {
      const inner = x - (Math.sign(x) * LEG) / 2 - Math.sign(x) * 0.05;
      const toRoad = right.clone().multiplyScalar(-Math.sign(x));
      mesh.face(P(inner, 0.5, -LEG_STRIP / 2), P(inner, 0.5, LEG_STRIP / 2), P(inner, GATE_HEIGHT, LEG_STRIP / 2), P(inner, GATE_HEIGHT, -LEG_STRIP / 2), toRoad);
      light(lights, P(x, top + BEACON_SIZE / 2), BEACON, BEACON_SIZE, 1.2, (n % 4) / 4);
      light(lights, P(x - Math.sign(x) * LEG, GATE_HEIGHT - 0.6, 0), FLOOD, FLOOD_SIZE, 0, 0);
    }
    n++;
  }
  return n > 0 ? mesh : null;
}
