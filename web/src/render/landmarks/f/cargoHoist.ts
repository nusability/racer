// The cargo hoist: a loading gantry over the deck, its beam carried on outrigger arms from a hoist
// module hung beside the road. Bound as a dropper, each pod is lowered from the beam on its
// cable, swung out over its landing spot, then let go to land on the dropper's spot exactly as
// its warning ends, in a burst of sparks. The track scene draws it lying there from then on (the
// same pod, render/track/scheduled.ts cargoPod), and throws nothing itself while bound.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { HAZARD_ROCK_HEIGHT } from '../../../data/tuning.ts';
import { cargoPod } from '../../track/scheduled.ts';
import { T } from '../b/shapes.ts';
import { brush, col, glowBoost } from '../a/kit.ts';
import { AMBER, FRAME, HAZARD, HULL, RED_LIGHT, RigKit, RoadFrame, bindHazard, box, brace, hide, hullModule, poseBrace, smooth01 } from './kit.ts';

const SALT = 0xc4a90;
const RADIUS = 26;
const MAX_LOADS = 8;
/** The beam rides this high over the deck, this deep and wide; it runs this far past the dropper's ends. */
const BEAM_H = 30;
const BEAM_SECTION = 2.4;
const BEAM_PAST = 20;
/** Outrigger arms carry the beam at its two ends: their section, and how far outside the road edge they root. */
const ARM = 1.8;
const ARM_ROOT = 4;
/** Height of the hoist module's top, where the arms' braces meet it. */
const MODULE_TOP = 10;
/** Share of the warning a pod is lowered and swung out on its cable; the rest it falls. */
const HANG_SHARE = 0.6;
/** Height of the pod over the road when it is let go. */
const RELEASE_H = 14;
/** The pod (as the track scene draws it landed) takes the kit's steel. */
const POD_COLOUR = 0x8c939c;
const SPARKS = 12;
/** Cable thickness, metres. */
const CABLE = 0.15;

export function createCargoHoist(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('cargoHoist', opts, ['dropper'] as const, {
    def: { type: 'dropper', id: 'free', from: 0, to: 0, count: 3, radius: 3, period: 10, warn: 2.6, stay: 3, phase: 0 },
    roadZ: -RADIUS * 1.6,
    lateral: -1,
    minX: -12,
    maxX: 12,
    span: RADIUS * 4,
  });
  const def = bound.def;
  if (def.count > MAX_LOADS) throw new Error(`cargoHoist: dropper ${def.id} drops ${def.count} pods; it can show ${MAX_LOADS}`);
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);
  const accent = opts.palette.accent;

  // --- The hoist module: winch house and a rack of pods waiting to go out ---
  hullModule(kit, 0, 10, 0, RADIUS * 1.3, 22, RADIUS * 1, accent);
  for (let i = 0; i < 6; i++) kit.solid.add(cargoPod().scale(2.2, 2.2, 2.2), i % 2 ? HULL : POD_COLOUR, T(-RADIUS * 0.5 + i * RADIUS * 0.2, 12.5 + (i % 2) * 4.6, -RADIUS * 0.5 - 2.6));
  kit.solid.add(box(RADIUS * 1.2, 0.8, 4), FRAME, T(0, 10, -RADIUS * 0.5 - 2.4));

  // --- Beam and outriggers (unit parts posed from the road each frame) ---
  const beam = rig.bone();
  rig.add(box(1, 1, 1).translate(0.5, 0, 0), FRAME, { bone: beam });
  rig.add(box(1, 0.12, 1.04).translate(0.5, -0.5, 0), HAZARD, { bone: beam, layer: 'glow' });
  const arms = [rig.bone(), rig.bone()];
  for (const bone of arms) rig.add(box(1, 1, 1).translate(0.5, 0, 0), FRAME, { bone });
  const struts = [brace(rig), brace(rig)];

  // --- The pods and their cables ---
  const loads: { pod: THREE.Bone; cable: THREE.Bone; wasWarn: boolean }[] = [];
  for (let i = 0; i < def.count; i++) {
    const pod = rig.bone();
    rig.add(cargoPod(), POD_COLOUR, { bone: pod });
    const cable = rig.bone();
    rig.add(box(1, 1, 1).translate(0.5, 0, 0), FRAME, { bone: cable });
    hide(pod);
    hide(cable);
    loads.push({ pod, cable, wasWarn: false });
  }

  const LAMPS = 4;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.6);
  const sparks = ik.cloud(ik.q(120, 60), 0, true, 2);
  const spark = brush({ life: 0.6, size0: 0.8, size1: 0.2, c0: col(0xffe0a0), c1: col(0xff6020), alpha: 1, keep: 0.6, lift: -9.8 });
  const red = col(RED_LIGHT);
  const amber = col(AMBER);
  const items: DropItem[] = [];
  const road = new RoadFrame(bound.binding);
  const L = new THREE.Vector3();
  const M = new THREE.Vector3();
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const loadH = def.radius * HAZARD_ROCK_HEIGHT;
  const mid = (h.minX + h.maxX) / 2;

  function update(time: number, dt: number): void {
    // The beam along the dropper's stretch over the course's middle, the arms out to it from the module's side.
    road.at(h.s0);
    const k = road.unit;
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    road.point(mid, BEAM_H, L).addScaledVector(road.along, -BEAM_PAST * k);
    road.at(h.s1);
    road.point(mid, BEAM_H, M).addScaledVector(road.along, BEAM_PAST * k);
    poseBrace(beam, L, M, BEAM_SECTION, k);
    const edge = home > 0 ? h.maxX : h.minX;
    // Each arm's root beside the road is braced back to the module.
    [L, M].forEach((end, i) => {
      road.at(i === 0 ? h.s0 : h.s1);
      road.point(edge + home * ARM_ROOT, BEAM_H, P).addScaledVector(road.along, (i === 0 ? -BEAM_PAST : BEAM_PAST) * k);
      poseBrace(arms[i], P, end, ARM, k);
      poseBrace(struts[i], A.set(0, MODULE_TOP, -RADIUS * 0.5), P, ARM, k);
    });

    dropperItems(h, time, items);
    let busy = false;
    items.forEach((it, i) => {
      const ld = loads[i];
      if (it.stage !== 'warn') {
        if (ld.wasWarn && it.stage === 'down' && dt > 0) {
          road.at(it.s);
          road.point(it.x, 0.5, P);
          for (let q = 0; q < SPARKS; q++) sparks.emit(spark, P.x, P.y + 1, P.z, (rng() - 0.5) * 20, 4 + rng() * 8, (rng() - 0.5) * 20);
        }
        ld.wasWarn = false;
        hide(ld.pod);
        hide(ld.cable);
        return;
      }
      ld.wasWarn = true;
      busy = true;
      road.at(it.s);
      road.point(it.x, loadH / 2, L);
      road.point(mid, BEAM_H - BEAM_SECTION / 2, M);
      let y: number;
      if (it.progress < HANG_SHARE) {
        // Lowered from the beam and swung out over its spot on the cable.
        const u = smooth01(it.progress / HANG_SHARE);
        y = BEAM_H - BEAM_SECTION - (BEAM_H - BEAM_SECTION - RELEASE_H) * u;
        ld.pod.position.lerpVectors(M, L, u).setY(L.y + y * k);
        P.copy(ld.pod.position).setY(ld.pod.position.y + loadH * 0.5 * k);
        poseBrace(ld.cable, M, P, CABLE, k);
      } else {
        // Let go: it falls the last stretch onto its spot.
        const u = (it.progress - HANG_SHARE) / (1 - HANG_SHARE);
        y = RELEASE_H * (1 - u * u);
        ld.pod.position.copy(L).setY(L.y + y * k);
        hide(ld.cable);
      }
      ld.pod.rotation.set(0, RoadFrame.yaw(road.across) + (1 - it.progress) * Math.sin(i * 1.7) * 0.6, 0);
      ld.pod.scale.set(def.radius * k, (loadH / 2) * k, def.radius * k);
    });
    rig.sync();

    // Lamps: red at the beam's ends, amber on the beam's middle while a pod is on its way.
    let li = 0;
    for (const s of [h.s0, h.s1]) {
      road.at(s);
      road.point(mid, BEAM_H + BEAM_SECTION / 2 + 0.6, P);
      glow.lamp(li++, P.x, P.y, P.z, 3, red, (Math.sin(time * 3 + s) > 0 ? 0.9 : 0.15) * boost);
    }
    for (const f of [0.35, 0.65]) {
      road.at(h.s0 + (h.s1 - h.s0) * f);
      road.point(mid, BEAM_H - BEAM_SECTION / 2 - 0.4, P);
      glow.lamp(li++, P.x, P.y, P.z, 2.5, amber, busy && Math.sin(time * 9) > 0 ? boost : 0.05);
    }
  }

  return ik.finish(RADIUS, RADIUS * 8, BEAM_H + 20, update);
}
