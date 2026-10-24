import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { PoseSnapshot } from '../racerPose.ts';
import type { GlowPoolLook } from './lookTuning.ts';

// The pool of thruster light each glider throws on the wet road beneath it. The post pass's
// mirrored reflections can only mirror about one plane (the road under the camera), so on a
// loop or corkscrew ahead they vanish; a pool laid in track space follows any surface, so the
// halo stays under every glider wherever the road goes. Additive and soft, it reads as light
// on the asphalt, and the bloom pass gives it its glow.

/** Corners of one pool, in pool-local (along, across) units of half length / half width. */
const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
];
/** Radial falloff texture resolution; it is blurred by sampling, so it can be small. */
const FALLOFF_TEXELS = 64;

export class GlowPools {
  readonly mesh: THREE.Mesh;
  private readonly track: Track;
  private readonly look: GlowPoolLook;
  private readonly colors: THREE.Color[];
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly tex: THREE.DataTexture;
  private readonly tmp = { x: 0, y: 0, z: 0 };
  private readonly tint = new THREE.Color();

  /** `glows`: each racer's thruster colour, in racer order. */
  constructor(track: Track, glows: readonly number[], look: GlowPoolLook) {
    this.track = track;
    this.look = look;
    this.colors = glows.map((g) => new THREE.Color(g));
    const n = glows.length;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3);
    this.col.setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(n * 4 * 2);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      CORNERS.forEach(([a, c], k) => uv.set([(a + 1) / 2, (c + 1) / 2], (i * 4 + k) * 2));
      const o = i * 4;
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', this.col);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.tex = falloffTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Lies on the road: win the depth tie with it.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'glowPools';
    this.mesh.frustumCulled = false;
  }

  /** Call once per rendered frame with racer i's interpolated pose. */
  update(i: number, pose: PoseSnapshot, boosting: boolean, wrecked: boolean) {
    const L = this.look;
    // Lifted off the road (a jump, the crest of a kicker), the light spreads and fades out.
    const fade = wrecked ? 0 : Math.max(0, 1 - pose.y / L.fadeHeight);
    const strength = fade * (boosting ? L.boostIntensity : L.intensity);
    this.tint.copy(this.colors[i]).multiplyScalar(strength);
    const ribbon = this.track.ribbon(pose.branch);
    const halfLen = L.length / 2;
    const halfWid = L.width / 2;
    CORNERS.forEach(([a, c], k) => {
      // Centred a little behind the craft: the light comes from its thrusters.
      let s = pose.s - L.behind + a * halfLen;
      if (pose.branch >= 0) s = Math.min(ribbon.length, Math.max(0, s));
      ribbon.toWorld(s, pose.x + c * halfWid, L.lift, this.tmp);
      const v = i * 4 + k;
      this.pos.setXYZ(v, this.tmp.x, this.tmp.y, this.tmp.z);
      this.col.setXYZ(v, this.tint.r, this.tint.g, this.tint.b);
    });
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

/** White in the middle, falling smoothly to nothing at the edge of the ellipse. */
function falloffTexture(): THREE.DataTexture {
  const n = FALLOFF_TEXELS;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5;
      const v = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.hypot(u, v) * 2);
      const level = Math.round((1 - r) * (1 - r) * 255);
      data.set([level, level, level, 255], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
