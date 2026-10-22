// Instanced crowds: stylised figures that bob, stroll and cheer in the vertex shader.

import * as THREE from 'three';
import type { SharedUniforms } from './motion.ts';
import type { Rng } from '../../../core/rng.ts';
import { T, pick } from './shapes.ts';

export interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  /** Facing (yaw); walking goes back and forth along it. */
  ry: number;
  color: THREE.ColorRepresentation;
  scale?: number;
  /** Bob height, metres, and its rate (rad/s) and phase. */
  hop: number;
  freq: number;
  phase: number;
  /** Pulse sharpness: 1 is a steady bob, ~10 a short jump (a stadium wave). */
  sharp?: number;
  /** Walk amplitude, metres, and rate (rad/s). */
  walk?: number;
  walkFreq?: number;
  /** How far the arms lift with each bob, 0..1 (cheering). */
  raise?: number;
}

const FIGURE_HEIGHT = 1.9;
const SHOULDER = 1.42;
const SKIN_TONES = [0x8a5a3c, 0xc08a62, 0x6a4030, 0xd8a880, 0xa06a48];

const CROWD_GLSL = /* glsl */ `
attribute vec4 aCrowd;
attribute vec4 aWalk;
attribute float aPart;
uniform float uTime;`;

/** A stylised person: tapered robe, head, two arm planes. aPart: 0 body, 1 head, 2 arms. */
function figureGeometry(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; part: number }[] = [];
  const robe = new THREE.CylinderGeometry(0.2, 0.36, SHOULDER, 4, 1, true).translate(0, SHOULDER / 2, 0).rotateY(Math.PI / 4);
  parts.push({ geo: robe, part: 0 });
  const head = new THREE.OctahedronGeometry(0.21).scale(1, 1.25, 1).translate(0, FIGURE_HEIGHT - 0.25, 0);
  parts.push({ geo: head, part: 1 });
  for (const side of [-1, 1]) {
    const arm = new THREE.PlaneGeometry(0.12, 0.72).rotateY(Math.PI / 2).translate(side * 0.27, SHOULDER - 0.38, 0);
    parts.push({ geo: arm, part: 2 });
  }
  const pos: number[] = [];
  const partAttr: number[] = [];
  for (const { geo, part } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      partAttr.push(part);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(partAttr, 1));
  return out;
}

function crowdMaterial(u: SharedUniforms, skin: THREE.Color): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uSkin = { value: skin };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CROWD_GLSL}\nuniform vec3 uSkin;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float pulse = pow(0.5 + 0.5 * sin(aCrowd.y * uTime + aCrowd.z), aCrowd.w);
        if (aPart > 1.5) {
          // Arms swing forward and up about the shoulder as the figure bobs.
          float ang = -pulse * aWalk.z * 2.8;
          vec3 a = transformed - vec3(0.0, ${SHOULDER.toFixed(2)}, 0.0);
          transformed = vec3(a.x, a.y * cos(ang) - a.z * sin(ang), a.y * sin(ang) + a.z * cos(ang)) + vec3(0.0, ${SHOULDER.toFixed(2)}, 0.0);
        }
        transformed.y += aCrowd.x * pulse;
        transformed.z += aWalk.x * sin(aWalk.y * uTime + aCrowd.z);`,
      )
      .replace('#include <color_vertex>', '#include <color_vertex>\nif (aPart > 0.5 && aPart < 1.5) vColor.rgb = uSkin;');
  };
  mat.customProgramCacheKey = () => 'mrb-crowd';
  return mat;
}

/** One instanced draw for every figure in the landmark. */
export function buildCrowd(spots: readonly CrowdSpot[], u: SharedUniforms, rng: Rng): THREE.InstancedMesh {
  const geo = figureGeometry();
  const n = spots.length;
  const crowd = new Float32Array(n * 4);
  const walk = new Float32Array(n * 4);
  const mat = crowdMaterial(u, new THREE.Color(pick(rng, SKIN_TONES)));
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const color = new THREE.Color();
  let reach = 0;
  spots.forEach((s, i) => {
    mesh.setMatrixAt(i, T(s.x, s.y, s.z, s.ry, 0, 0, s.scale ?? 1));
    mesh.setColorAt(i, color.set(s.color));
    crowd.set([s.hop, s.freq, s.phase, s.sharp ?? 1], i * 4);
    walk.set([s.walk ?? 0, s.walkFreq ?? 0, s.raise ?? 0, 0], i * 4);
    reach = Math.max(reach, (s.walk ?? 0) + s.hop);
  });
  geo.setAttribute('aCrowd', new THREE.InstancedBufferAttribute(crowd, 4));
  geo.setAttribute('aWalk', new THREE.InstancedBufferAttribute(walk, 4));
  // Instances stroll and jump off their rest pose; pad the per-figure bound to cover it.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.5 + reach);
  mesh.name = 'crowd';
  return mesh;
}
