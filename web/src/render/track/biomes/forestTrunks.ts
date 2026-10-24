import * as THREE from 'three';

// The near trunks' material and their instances. Near the trail every trunk is real 3D: the
// colonnade at its edge (where it collides), the rank behind it and the trunks standing in it.
// One unit trunk (forestProps.ts) is instanced per map cell, each cell one draw that culls as a
// whole; past TRUNK_VIEW the same trunks show as impostors (forestSprites.ts) instead.

/**
 * Sun through the canopy lands in patches: where one falls, a trunk takes this much more of the
 * sun's direct light than its share (the sun is dimmed under the canopy, config.ts), elsewhere
 * this little; the patches are this big (m) and stretched this much up the trunk.
 */
const DAPPLE_LIT = 2.6;
const DAPPLE_SHADE = 0.45;
const DAPPLE_SIZE = 16;
const DAPPLE_STRETCH = 0.25;
/** Share of the dapple pattern in sun (the rest is canopy shadow), and how soft its edges are. */
const DAPPLE_COVER = 0.3;
const DAPPLE_SOFT = 0.12;

/**
 * Lambert bark: the bark texture and its furrows' normal map, the vertex colours' moss and
 * canopy shade, and dappled sun: the direct light comes and goes in patches over the bark.
 */
export function trunkMaterial(map: THREE.Texture, normalMap: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map, normalMap, vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBarkWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBarkWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBarkWorld;
float dappleNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec2 q = vec2(vBarkWorld.x + vBarkWorld.z, vBarkWorld.y * ${DAPPLE_STRETCH.toFixed(2)} + vBarkWorld.x * 0.3) / ${DAPPLE_SIZE.toFixed(1)};
  float n = dappleNoise(q) * 0.75 + dappleNoise(q * 2.3 + 13.0) * 0.25;
  float lit = smoothstep(${(1 - DAPPLE_COVER - DAPPLE_SOFT).toFixed(2)}, ${(1 - DAPPLE_COVER + DAPPLE_SOFT).toFixed(2)}, n);
  reflectedLight.directDiffuse *= mix(${DAPPLE_SHADE.toFixed(2)}, ${DAPPLE_LIT.toFixed(2)}, lit);
}`,
      );
  };
  mat.customProgramCacheKey = () => 'forest-bark';
  return mat;
}

interface Trunk {
  x: number;
  y: number;
  z: number;
  yaw: number;
  r: number;
  h: number;
  shade: number;
}

/** Near trunks gathered by map cell (m a side), each cell one instanced draw. */
export class TrunkCells {
  private readonly cells = new Map<string, Trunk[]>();
  count = 0;

  constructor(
    private readonly size: number,
    private readonly origin: { x: number; z: number },
  ) {}

  add(x: number, y: number, z: number, yaw: number, r: number, h: number, shade: number): void {
    const key = `${Math.floor((x - this.origin.x) / this.size)},${Math.floor((z - this.origin.z) / this.size)}`;
    let list = this.cells.get(key);
    if (!list) this.cells.set(key, (list = []));
    list.push({ x, y, z, yaw, r, h, shade });
    this.count++;
  }

  meshes(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [key, list] of this.cells) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        mesh.setMatrixAt(i, m.compose(p.set(t.x, t.y, t.z), q.setFromAxisAngle(up, t.yaw), sc.set(t.r, t.h, t.r)));
        mesh.setColorAt(i, c.setScalar(t.shade));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `${name}:${key}`;
      out.push(mesh);
    }
    return out;
  }
}
