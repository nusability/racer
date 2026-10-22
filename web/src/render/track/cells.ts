import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';

// Boost cells: floating energy canisters the racer flies through to fill the boost tank.
// Every cell of every ribbon is one instance of a lit-looking core plus one billboard halo,
// so the whole track's cells cost two draw calls. Collected cells pop and hide until the
// next lap.

/** Height of a cell's centre above the road, metres (racers hover around 1–2 m). */
const CELL_HEIGHT = 2.6;
const BOB = 0.45;
const BOB_RATE = 2.2;
const SPIN_RATE = 1.7;
/** Halo billboard size, metres: big enough to read from 150 m at race speed. */
const HALO_SIZE = 9;
/** Collect effect: the core swells and vanishes, the halo flares and fades. */
const POP_TIME = 0.35;
const POP_SWELL = 2.2;
const POP_FLARE = 2.6;
const CORE_COLOUR = new THREE.Color(0xc8fbff);
const HALO_COLOUR = new THREE.Color(0x38e8ff);

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = instanceColor;
  // Billboard: the instance's centre in view space, the quad spread across the screen plane.
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scale = length(instanceMatrix[0].xyz);
  mvPosition.xy += position.xy * scale;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const HALO_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float glow = pow(max(0.0, 1.0 - r), 2.2) + 0.6 * pow(max(0.0, 1.0 - r), 8.0);
  gl_FragColor = vec4(vColor * glow, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export interface CellField {
  meshes: THREE.Object3D[];
  update(time: number): void;
  /** Pops a cell (at the time of the last update) and hides it until reset. */
  collect(ribbon: number, cell: number): void;
  reset(): void;
  dispose(): void;
}

/** ribbons[0] is the main loop (-1 in the public API), then branches in order. */
export function buildCells(ribbons: Ribbon[]): CellField {
  const items: { pos: THREE.Vector3; phase: number; popAt: number; taken: boolean }[] = [];
  const lookup = new Map<string, number>();
  ribbons.forEach((r, ri) => {
    for (const c of r.cells) {
      const p = r.toWorld(c.s, c.x, CELL_HEIGHT);
      lookup.set(`${ri - 1}:${c.index}`, items.length);
      items.push({ pos: new THREE.Vector3(p.x, p.y, p.z), phase: (c.s * 0.37) % (Math.PI * 2), popAt: -1, taken: false });
    }
  });
  const n = Math.max(1, items.length);
  // A canister: capsule core with a bright band, faceted for a crisp silhouette.
  const coreGeo = new THREE.CapsuleGeometry(0.75, 1.5, 3, 8);
  const coreMat = new THREE.MeshBasicMaterial({ color: CORE_COLOUR });
  const core = new THREE.InstancedMesh(coreGeo, coreMat, n);
  core.name = 'boostCells';
  const haloGeo = new THREE.PlaneGeometry(HALO_SIZE, HALO_SIZE);
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const halo = new THREE.InstancedMesh(haloGeo, haloMat, n);
  halo.name = 'boostCellHalos';
  // Cells move every frame; their bounds are the whole track, so skip per-mesh culling.
  core.frustumCulled = false;
  halo.frustumCulled = false;
  core.count = items.length;
  halo.count = items.length;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < items.length; i++) halo.setColorAt(i, HALO_COLOUR);
  let now = 0;

  const field: CellField = {
    meshes: [core, halo],
    update(time) {
      now = time;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let coreScale = 1;
        let haloScale = 1;
        let haloGain = 1;
        if (it.taken) {
          const t = it.popAt < 0 ? 1 : (time - it.popAt) / POP_TIME;
          if (t >= 1) {
            coreScale = 0;
            haloScale = 0;
          } else {
            coreScale = 1 + (POP_SWELL - 1) * t - POP_SWELL * t * t;
            haloScale = 1 + (POP_FLARE - 1) * t;
            haloGain = 1 - t;
          }
        }
        pos.copy(it.pos);
        pos.y += Math.sin(time * BOB_RATE + it.phase) * BOB;
        e.set(0.35, time * SPIN_RATE + it.phase, 0);
        q.setFromEuler(e);
        sc.setScalar(Math.max(0, coreScale));
        m.compose(pos, q, sc);
        core.setMatrixAt(i, m);
        sc.setScalar(haloScale);
        m.compose(pos, q.identity(), sc);
        halo.setMatrixAt(i, m);
        halo.setColorAt(i, col.copy(HALO_COLOUR).multiplyScalar(haloGain * (0.85 + 0.15 * Math.sin(time * 6 + it.phase))));
      }
      core.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
      if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
    },
    collect(ribbon, cell) {
      const i = lookup.get(`${ribbon}:${cell}`);
      if (i === undefined) throw new Error(`No boost cell ${cell} on ribbon ${ribbon}`);
      if (items[i].taken) return;
      items[i].taken = true;
      items[i].popAt = now;
    },
    reset() {
      for (const it of items) {
        it.taken = false;
        it.popAt = -1;
      }
    },
    dispose() {
      coreGeo.dispose();
      coreMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
    },
  };
  field.update(now);
  return field;
}
