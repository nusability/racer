import * as THREE from 'three';
import type { SpriteFrame, SpriteKind } from './forestPaint.ts';

// Everything in the woods past the near trunks, and the ferns everywhere: camera-facing sprites
// from one atlas (forestPaint.ts), each an upright quad turned about the vertical toward the
// viewer. Each map cell's sprites are one instanced draw of one material, whatever they are
// (trunks, ferns, shrubs, canopy clumps), so the woods fill the frame for a handful of draws.
// Each frame of the atlas has its own range: ferns shrink away past a hundred-odd metres, and the
// impostor of a trunk that also stands in 3D (the colonnade) only shows past the 3D range.

/** Per kind: how the sprite is lit (its normal: share turned to the camera, the rest up; negative is down). */
const FACING: Record<SpriteKind, { toCamera: number; up: number }> = {
  // A trunk is a cylinder: the side the viewer sees faces them.
  trunk: { toCamera: 1, up: 0 },
  // Ferns and shrubs are lit from above, their faces toward the viewer.
  fern: { toCamera: 0.5, up: 0.85 },
  shrub: { toCamera: 0.6, up: 0.6 },
  // Canopy clumps hang overhead: their undersides are what a racer sees.
  canopy: { toCamera: 0.3, up: -0.9 },
};
/** A sprite shrinks to nothing over this last share of its range, so the cut-off never pops. */
const SHRINK = 0.15;
/** Cut-out threshold of the atlas alpha. */
const ALPHA_CUT = 0.5;

/** One range per atlas frame use: [nearest, farthest] distance from the camera it draws at (m). */
export interface SpriteUse {
  frame: SpriteFrame;
  near: number;
  far: number;
}

/**
 * The sprites' material: Lambert lit (so they take the world's sun, sky and fog like the 3D
 * trunks), the atlas frame and range per instance chosen by `uses` (the instance's scale z is
 * its use's index + 1; x and y are its width and height in metres, its position the foot).
 */
export function spriteMaterial(atlas: THREE.Texture, uses: SpriteUse[]): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: ALPHA_CUT, vertexColors: false, side: THREE.DoubleSide });
  const rects = uses.map((u) => new THREE.Vector4(...u.frame.rect));
  const ranges = uses.map((u) => new THREE.Vector4(u.near, u.far, FACING[u.frame.kind].toCamera, FACING[u.frame.kind].up));
  const n = uses.length;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRect = { value: rects };
    shader.uniforms.uRange = { value: ranges };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec4 uRect[${n}];
uniform vec4 uRange[${n}];
vec3 spriteWorld;
vec3 spriteNormal;`,
      )
      .replace(
        // The normal chunks come before begin_vertex in Lambert's shader, after the uv chunk.
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
{
  vec3 foot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  int frame = int(instanceMatrix[2][2] + 0.5) - 1;
  vec4 span = uRange[frame];
  vec3 toCam = cameraPosition - foot;
  float dist = length(toCam);
  // Outside its range a sprite collapses to a point (nothing drawn); near its far end it shrinks away.
  float keep = step(span.x, dist) * (1.0 - smoothstep(span.y * ${(1 - SHRINK).toFixed(2)}, span.y, dist));
  vec3 facing = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(facing.z, 0.0, -facing.x);
  spriteWorld = foot + (right * position.x * size.x + vec3(0.0, position.y * size.y, 0.0)) * keep;
  spriteNormal = normalize(facing * span.z + vec3(0.0, span.w, 0.0));
  vMapUv = uRect[frame].xy + uv * uRect[frame].zw;
}`,
      )
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(mat3(viewMatrix) * spriteNormal);')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(spriteWorld, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(spriteWorld, 1.0);');
  };
  mat.customProgramCacheKey = () => `forest-sprite-${n}`;
  return mat;
}

/** The sprite quad: unit wide, unit tall, standing on its foot at the origin. */
export function spriteGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
}

interface Sprite {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  use: number;
  shade: number;
}

/**
 * Sprites gathered by map cell, each cell one instanced draw that culls as a whole (by the
 * frustum, and by distance in `visible`). The grid starts at the woods' corner.
 */
export class SpriteCells {
  private readonly cells = new Map<string, Sprite[]>();
  count = 0;

  constructor(
    private readonly size: number,
    private readonly origin: { x: number; z: number },
  ) {}

  add(x: number, y: number, z: number, w: number, h: number, use: number, shade: number): void {
    const key = `${Math.floor((x - this.origin.x) / this.size)},${Math.floor((z - this.origin.z) / this.size)}`;
    let list = this.cells.get(key);
    if (!list) this.cells.set(key, (list = []));
    list.push({ x, y, z, w, h, use, shade });
    this.count++;
  }

  meshes(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const [key, list] of this.cells) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const box = new THREE.Box3();
      list.forEach((sp, i) => {
        mesh.setMatrixAt(i, m.compose(pos.set(sp.x, sp.y, sp.z), q, scale.set(sp.w, sp.h, sp.use + 1)));
        mesh.setColorAt(i, c.setScalar(sp.shade));
        // A sprite turns to the viewer: its bounds are a column as wide as it is, all round.
        box.expandByPoint(pos.set(sp.x - sp.w / 2, sp.y, sp.z - sp.w / 2));
        box.expandByPoint(pos.set(sp.x + sp.w / 2, sp.y + sp.h, sp.z + sp.w / 2));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      mesh.name = `${name}:${key}`;
      out.push(mesh);
    }
    return out;
  }
}
