import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { Corridor } from '../corridor.ts';
import { clearOfRoads } from './spaceStation.ts';
import type { StationMesh } from './stationMesh.ts';

// Solar arrays beside the road: rows of panels on masts, every panel turned square to the star,
// the masts standing on a truss that runs along the deck's outside at deck level (or, on a moon,
// on the ground). Built into a station mesh, so the station material draws the cells and the
// whole farm is one draw.

/** Rows of panels: their gap out from the hard boundary (past the station's structure clearance), metres. */
const ROWS = [14, 34] as const;
/** A panel every this many metres along the road; its size along and across, and its thickness. */
const PANEL_STEP = 19;
const PANEL_LONG = 16;
const PANEL_WIDE = 9;
const PANEL_THICK = 0.3;
/** Panels ride this high over the deck on their masts. */
const MAST_HEIGHT = 6;
const MAST_WIDTH = 0.7;
/** The truss along the deck's outside: its chord spacing and members, under the deck's level. */
const TRUSS = 1.6;
const TRUSS_MEMBER = 0.22;
const TRUSS_DROP = 1.5;
/** Cell tint (sRGB), as the station's own arrays, a little varied panel to panel; frame steel. */
const SOLAR_CELLS = 0x1c3466;
const CELL_SPREAD = 0.12;
const STEEL = 0x6c737e;
/** Seeds the material's cell pattern per panel. */
const PANEL_SEED = 72;

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

/** Rows of panels beside main-road span s0..s1 on `side` (both when omitted), into `mesh`. */
export function solarArrays(cor: Corridor, s0: number, s1: number, side: -1 | 1 | undefined, sun: THREE.Vector3, rng: Rng, mesh: StationMesh, onGround: boolean): void {
  const r = cor.ribbon;
  const face = new THREE.Quaternion().setFromUnitVectors(UP, sun.clone().normalize());
  for (const sd of side === undefined ? [-1, 1] : [side]) {
    for (const gap of ROWS) {
      let prev: THREE.Vector3 | null = null;
      for (let s = s0; s <= s1; s += PANEL_STEP) {
        const k = cor.idx(Math.round(s / r.step));
        const deckY = r.samples[k].pos.y;
        const foot = cor.beside(k, sd, gap, deckY);
        const t = r.samples[k].tangent;
        const f = new THREE.Vector3(t.x, 0, t.z).normalize();
        const o = new THREE.Vector3(cor.shape.rx[k] * sd, 0, cor.shape.rz[k] * sd);
        const corner = (u: number, v: number) => ({ x: foot.x + f.x * u + o.x * v, y: 0, z: foot.z + f.z * u + o.z * v });
        const corners = [corner(-PANEL_LONG / 2, -PANEL_WIDE / 2), corner(PANEL_LONG / 2, -PANEL_WIDE / 2), corner(PANEL_LONG / 2, PANEL_WIDE / 2), corner(-PANEL_LONG / 2, PANEL_WIDE / 2)];
        const base = onGround ? cor.ground.height(foot.x, foot.z) : deckY - TRUSS_DROP;
        const top = deckY + MAST_HEIGHT;
        if (!clearOfRoads(cor.ground, corners, base, top + PANEL_WIDE / 2)) {
          prev = null;
          continue;
        }
        // The panel, square to the star, its long side along the road before it turns.
        const turn = face.clone().multiply(new THREE.Quaternion().setFromUnitVectors(X, f));
        mesh.at(new THREE.Matrix4().compose(new THREE.Vector3(foot.x, top, foot.z), turn, new THREE.Vector3(1, 1, 1)));
        mesh.paint('solar', new THREE.Color(SOLAR_CELLS).multiplyScalar(range(rng, 1 - CELL_SPREAD, 1 + CELL_SPREAD)), PANEL_SEED).box(PANEL_LONG, PANEL_THICK, PANEL_WIDE);
        // The mast, from the truss (or the ground) up to the panel.
        const footing = new THREE.Vector3(foot.x, base, foot.z);
        mesh.paint('steel', STEEL, 1).beam(footing, new THREE.Vector3(foot.x, top, foot.z), MAST_WIDTH, MAST_WIDTH, f);
        // In the void the masts stand on a truss along the deck's outside.
        if (!onGround && prev) mesh.truss(prev, footing, TRUSS, PANEL_STEP / 2, TRUSS_MEMBER, UP, 'y');
        prev = footing;
      }
    }
  }
}
