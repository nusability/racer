import * as THREE from 'three';
import { facadeBox, facadeCylinder, facadeDome, facadeSpire, facadeTwist } from '../../facadeGeometry.ts';
import type { FacadeMaterial } from '../../facade.ts';
import { packStyle, type FacadeStyle } from '../../facadeStyle.ts';

// Every piece of every city building, collected by kit shape and drawn as one instanced mesh
// per shape (five draws for the whole city), each instance carrying its own tint and facade style.

export type PartShape = 'box' | 'cylinder' | 'dome' | 'spire' | 'twist';

const SHAPES: Record<PartShape, () => THREE.BufferGeometry> = {
  box: facadeBox,
  cylinder: facadeCylinder,
  dome: facadeDome,
  spire: facadeSpire,
  twist: facadeTwist,
};

interface Part {
  m: THREE.Matrix4;
  tint: THREE.Color;
  style: FacadeStyle;
}

const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const X = new THREE.Vector3();

export class CityParts {
  private readonly parts: Record<PartShape, Part[]> = { box: [], cylinder: [], dome: [], spire: [], twist: [] };

  /** A shape w × h × d with its base centred on (x, y, z), turned by yaw about +Y. */
  add(shape: PartShape, x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, tint: THREE.Color, style: FacadeStyle): void {
    if (!(w > 0 && h > 0 && d > 0)) throw new Error(`city part ${shape} has a degenerate size ${w} × ${h} × ${d}`);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(w, h, d));
    this.parts[shape].push({ m, tint, style });
  }

  /** A box of cross-section w × d strung from a to b (a cable, a pipe). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, tint: THREE.Color, style: FacadeStyle): void {
    Y.subVectors(b, a);
    const len = Y.length();
    if (len <= 0) throw new Error('city beam has no length');
    Y.divideScalar(len);
    // Any side axis square to the beam, level where the beam is not upright.
    X.crossVectors(Y, Math.abs(Y.y) > 0.99 ? Z.set(1, 0, 0) : UP).normalize();
    Z.crossVectors(X, Y);
    const m = new THREE.Matrix4().makeBasis(X.clone().multiplyScalar(w), Y.clone().multiplyScalar(len), Z.clone().multiplyScalar(d)).setPosition(a);
    this.parts.box.push({ m, tint, style });
  }

  /** One instanced mesh per shape in use. */
  meshes(material: FacadeMaterial): { objects: THREE.InstancedMesh[]; geometries: THREE.BufferGeometry[] } {
    const objects: THREE.InstancedMesh[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    for (const shape of Object.keys(SHAPES) as PartShape[]) {
      const list = this.parts[shape];
      if (list.length === 0) continue;
      const geo = SHAPES[shape]();
      const styles = new Float32Array(list.length * 4);
      list.forEach((p, i) => packStyle(p.style, styles, i));
      geo.setAttribute('facadeStyle', new THREE.InstancedBufferAttribute(styles, 4));
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((p, i) => {
        mesh.setMatrixAt(i, p.m);
        mesh.setColorAt(i, p.tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `city-${shape}`;
      objects.push(mesh);
      geometries.push(geo);
    }
    return { objects, geometries };
  }
}
