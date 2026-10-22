// Dynamic racer parts rebuilt every frame in place: the crackling binder beams between engines,
// the tow cables (they follow the swaying pod) and the exhaust flame cone geometry.
import * as THREE from 'three';
import type { CableSpec, Detail } from './racerBlueprint.ts';

/** Strand recipe for one binder: a wide soft halo, a hot core and jagged arcs. */
interface Strand {
  width: number;
  intensity: number;
  /** Lateral wander at mid-span, metres. */
  amplitude: number;
}
const BINDER_HALO: Strand = { width: 0.55, intensity: 0.22, amplitude: 0.02 };
const BINDER_CORE: Strand = { width: 0.11, intensity: 1.0, amplitude: 0.05 };
const BINDER_ARC: Strand = { width: 0.05, intensity: 0.95, amplitude: 0.32 };
const BINDER_ARCS = { high: 3, low: 1 } as const;
const BINDER_SEGMENTS = { high: 10, low: 6 } as const;
/** Arc shapes re-roll this often (Hz): the crackle rate. */
const BINDER_CRACKLE_HZ = 24;
/** Chance an arc is dark on a given crackle. */
const BINDER_ARC_DROPOUT = 0.3;

/** Cross-section: two crossed planes of (edge, centre, edge) so the beam reads from any angle. */
const BINDER_SECTION_VERTS = 6;

const scratchA = new THREE.Vector3();
const scratchU = new THREE.Vector3();
const scratchV = new THREE.Vector3();
const scratchD = new THREE.Vector3();
const scratchP = new THREE.Vector3();

function perpendiculars(d: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3): void {
  // Any axis not parallel to the span works; pick the least aligned for stability.
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  if (ax <= ay && ax <= Math.abs(d.z)) u.set(1, 0, 0);
  else if (ay <= Math.abs(d.z)) u.set(0, 1, 0);
  else u.set(0, 0, 1);
  v.crossVectors(d, u).normalize();
  u.crossVectors(v, d).normalize();
}

export class BinderBeams {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly strands: Strand[];
  private readonly segments: number;
  /** Random lateral offsets per strand point (u, v), re-rolled each crackle. */
  private readonly jitter: Float32Array;
  private readonly arcGain: Float32Array;
  private crackleTimer = 0;

  constructor(private readonly binders: [THREE.Vector3, THREE.Vector3][], detail: Detail, material: THREE.Material) {
    this.segments = BINDER_SEGMENTS[detail];
    this.strands = [BINDER_HALO, BINDER_CORE];
    for (let i = 0; i < BINDER_ARCS[detail]; i++) this.strands.push(BINDER_ARC);
    const strandCount = binders.length * this.strands.length;
    const sections = this.segments + 1;
    this.positions = new Float32Array(strandCount * sections * BINDER_SECTION_VERTS * 3);
    this.colors = new Float32Array(this.positions.length);
    this.jitter = new Float32Array(strandCount * sections * 2);
    this.arcGain = new Float32Array(strandCount).fill(1);
    const index: number[] = [];
    for (let s = 0; s < strandCount; s++) {
      for (let k = 0; k < this.segments; k++) {
        const a = (s * sections + k) * BINDER_SECTION_VERTS;
        const b = a + BINDER_SECTION_VERTS;
        for (let plane = 0; plane < 2; plane++) {
          for (let half = 0; half < 2; half++) {
            const o = plane * 3 + half;
            index.push(a + o, b + o, a + o + 1, a + o + 1, b + o, b + o + 1);
          }
        }
      }
    }
    this.geometry.setIndex(index);
    const pos = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', pos);
    this.geometry.setAttribute('color', col);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.crackle();
  }

  private crackle(): void {
    const sections = this.segments + 1;
    for (let s = 0; s < this.arcGain.length; s++) {
      const strand = this.strands[s % this.strands.length];
      const isArc = strand === BINDER_ARC;
      this.arcGain[s] = isArc && Math.random() < BINDER_ARC_DROPOUT ? 0 : 0.6 + Math.random() * 0.4;
      for (let k = 0; k < sections; k++) {
        const j = (s * sections + k) * 2;
        this.jitter[j] = Math.random() * 2 - 1;
        this.jitter[j + 1] = Math.random() * 2 - 1;
      }
    }
    this.writeColors();
  }

  private writeColors(): void {
    const sections = this.segments + 1;
    for (let s = 0; s < this.arcGain.length; s++) {
      const strand = this.strands[s % this.strands.length];
      for (let k = 0; k < sections; k++) {
        // Fade toward the emitters so the beam springs out of the tips rather than ending flat.
        const t = k / this.segments;
        const ends = Math.min(1, Math.sin(Math.PI * t) * 2.5 + 0.35);
        const c = strand.intensity * this.arcGain[s] * ends;
        const base = (s * sections + k) * BINDER_SECTION_VERTS * 3;
        for (let vtx = 0; vtx < BINDER_SECTION_VERTS; vtx++) {
          const centre = vtx % 3 === 1 ? c : 0;
          this.colors[base + vtx * 3] = centre;
          this.colors[base + vtx * 3 + 1] = centre;
          this.colors[base + vtx * 3 + 2] = centre;
        }
      }
    }
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** `energy` 0..1 scales arc reach (boost makes the binder lash about). */
  update(dt: number, time: number, energy: number): void {
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 1 / BINDER_CRACKLE_HZ;
      this.crackle();
    }
    const sections = this.segments + 1;
    let s = 0;
    for (const [a, b] of this.binders) {
      scratchD.subVectors(b, a);
      const span = scratchD.length();
      scratchD.divideScalar(span);
      perpendiculars(scratchD, scratchU, scratchV);
      for (const strand of this.strands) {
        const amp = strand.amplitude * (0.6 + energy * 0.8) * span * 0.5;
        for (let k = 0; k < sections; k++) {
          const t = k / this.segments;
          const env = Math.sin(Math.PI * t);
          const j = (s * sections + k) * 2;
          // A slow wave keeps the beam alive between crackles.
          const wave = Math.sin(time * 9 + t * 7 + s) * 0.3;
          const du = (this.jitter[j] + wave) * amp * env;
          const dv = (this.jitter[j + 1] - wave) * amp * env;
          scratchP.copy(a).addScaledVector(scratchD, span * t).addScaledVector(scratchU, du).addScaledVector(scratchV, dv);
          const base = (s * sections + k) * BINDER_SECTION_VERTS * 3;
          const w = strand.width * 0.5;
          this.writeSection(base, scratchP, scratchU, w);
          this.writeSection(base + 9, scratchP, scratchV, w);
        }
        s++;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private writeSection(base: number, p: THREE.Vector3, axis: THREE.Vector3, w: number): void {
    const out = this.positions;
    out[base] = p.x - axis.x * w;
    out[base + 1] = p.y - axis.y * w;
    out[base + 2] = p.z - axis.z * w;
    out[base + 3] = p.x;
    out[base + 4] = p.y;
    out[base + 5] = p.z;
    out[base + 6] = p.x + axis.x * w;
    out[base + 7] = p.y + axis.y * w;
    out[base + 8] = p.z + axis.z * w;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

const CABLE_SEGMENTS = { high: 6, low: 4 } as const;
const CABLE_WIDTH = 0.07;
/** Mid-span droop, metres. */
const CABLE_SAG = 0.22;
const CABLE_COLOR = 0x1a1714;

/** Tow cables as crossed ribbons, re-bent each frame so they stay attached to the swaying pod. */
export class CableRibbons {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly segments: number;

  constructor(private readonly cables: CableSpec[], detail: Detail, material: THREE.Material) {
    this.segments = CABLE_SEGMENTS[detail];
    const sections = this.segments + 1;
    const verts = cables.length * sections * 4;
    this.positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const normals = new Float32Array(verts * 3);
    const c = new THREE.Color(CABLE_COLOR);
    for (let i = 0; i < verts; i++) {
      colors.set([c.r, c.g, c.b], i * 3);
      normals.set([0, 1, 0], i * 3);
    }
    const index: number[] = [];
    for (let n = 0; n < cables.length; n++) {
      for (let k = 0; k < this.segments; k++) {
        const a = (n * sections + k) * 4;
        const b = a + 4;
        index.push(a, b, a + 1, a + 1, b, b + 1, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** `podMatrix` maps pod space into craft space. */
  update(podMatrix: THREE.Matrix4, time: number): void {
    const sections = this.segments + 1;
    const w = CABLE_WIDTH * 0.5;
    for (let n = 0; n < this.cables.length; n++) {
      const cable = this.cables[n];
      scratchA.copy(cable.pod).applyMatrix4(podMatrix);
      scratchD.subVectors(scratchA, cable.engine);
      const sway = Math.sin(time * 3.1 + n * 1.3) * 0.04;
      for (let k = 0; k < sections; k++) {
        const t = k / this.segments;
        const droop = 4 * t * (1 - t);
        scratchP.copy(cable.engine).addScaledVector(scratchD, t);
        scratchP.y -= droop * CABLE_SAG;
        scratchP.x += droop * sway;
        const o = (n * sections + k) * 12;
        const out = this.positions;
        out[o] = scratchP.x - w; out[o + 1] = scratchP.y; out[o + 2] = scratchP.z;
        out[o + 3] = scratchP.x + w; out[o + 4] = scratchP.y; out[o + 5] = scratchP.z;
        out[o + 6] = scratchP.x; out[o + 7] = scratchP.y - w; out[o + 8] = scratchP.z;
        out[o + 9] = scratchP.x; out[o + 10] = scratchP.y + w; out[o + 11] = scratchP.z;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** Flame cone: base (radius 1) at z = 0, tip at z = 1, vertex brightness fading to the tip so
 * additive blending makes it dissolve without a texture. */
export function createFlameGeometry(detail: Detail): THREE.BufferGeometry {
  const profile = [[0.85, 0], [1.0, 0.1], [0.85, 0.35], [0.5, 0.65], [0.0, 1.0]];
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), detail === 'high' ? 10 : 7);
  geo.rotateX(Math.PI / 2);
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = Math.pow(1 - pos.getZ(i), 1.4);
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
