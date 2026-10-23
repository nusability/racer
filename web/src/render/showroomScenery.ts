// Static set for the garage showroom: a dark pit garage with a curved back wall of light strips
// and a polished floor. Deliberately neutral so it fits every world the game visits; the racer
// and its glow-tinted launch pad carry the colour.
import * as THREE from 'three';

export const SHOWROOM_BACKGROUND = 0x1b1e24;
const FLOOR = 0x3a3f47;
const WALL = 0x404651;
const WALL_TRIM = 0x555c68;
const STRIP = 0xfff1dc;
const FLOOR_RADIUS = 70;
const WALL_RADIUS = 26;
const WALL_HEIGHT = 15;
/** The wall wraps the half of the garage behind the pad (as seen from the camera at +Z). */
const WALL_ARC = Math.PI * 1.2;
const WALL_STRIPS = 13;
const STRIP_WIDTH = 0.35;
/** Strip brightness (basic material, so it reads as a light source under any lighting). */
const STRIP_GAIN = 0.9;

export interface ShowroomSet {
  group: THREE.Group;
  dispose(): void;
}

export function buildShowroomSet(): ShowroomSet {
  const group = new THREE.Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };

  const floorGeo = own(new THREE.CircleGeometry(FLOOR_RADIUS, 48));
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, own(new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.7, metalness: 0.05 })));
  floor.position.y = -0.3;
  group.add(floor);

  // Curved back wall, open toward the camera; panels are flat-shaded so the curve facets read.
  // CylinderGeometry puts theta at (sin θ, ·, cos θ): θ = π is straight behind the pad.
  const wallStart = Math.PI - WALL_ARC / 2;
  const wallGeo = own(new THREE.CylinderGeometry(WALL_RADIUS, WALL_RADIUS, WALL_HEIGHT, 26, 1, true, wallStart, WALL_ARC));
  const wall = new THREE.Mesh(wallGeo, own(new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.7, metalness: 0.1, flatShading: true, side: THREE.BackSide })));
  wall.position.y = WALL_HEIGHT / 2 - 0.3;
  group.add(wall);
  const trimGeo = own(new THREE.CylinderGeometry(WALL_RADIUS - 0.2, WALL_RADIUS - 0.2, 0.8, 26, 1, true, wallStart, WALL_ARC));
  const trim = new THREE.Mesh(trimGeo, own(new THREE.MeshStandardMaterial({ color: WALL_TRIM, roughness: 0.5, side: THREE.BackSide })));
  trim.position.y = 0.1;
  group.add(trim);

  // Vertical light strips on the wall plus one long overhead bar: the "pit lane at night" look.
  const stripMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(STRIP).multiplyScalar(STRIP_GAIN), toneMapped: false }));
  const stripGeo = own(new THREE.BoxGeometry(STRIP_WIDTH, WALL_HEIGHT * 0.62, 0.1));
  const strips = new THREE.InstancedMesh(stripGeo, stripMat, WALL_STRIPS + 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < WALL_STRIPS; i++) {
    const a = wallStart + ((i + 0.5) / WALL_STRIPS) * WALL_ARC;
    p.set(Math.sin(a) * (WALL_RADIUS - 0.25), WALL_HEIGHT * 0.42, Math.cos(a) * (WALL_RADIUS - 0.25));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    strips.setMatrixAt(i, m.compose(p, q, one));
  }
  // Two floor-level lane lights leading away behind the pad.
  for (let i = 0; i < 2; i++) {
    p.set(i === 0 ? -9 : 9, -0.28, -12);
    q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    strips.setMatrixAt(WALL_STRIPS + i, m.compose(p, q, new THREE.Vector3(0.6, 2.4, 1)));
  }
  group.add(strips);
  return { group, dispose: () => owned.forEach((o) => o.dispose()) };
}

/** Radial disc whose vertex alpha fades from `centre` to 0 at the rim. */
function radialDisc(radius: number, rgb: [number, number, number], centre: number, material: THREE.MeshBasicMaterial): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / radius;
    colors.set([rgb[0], rgb[1], rgb[2], centre * (1 - r) * (1 - r)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return new THREE.Mesh(geo, material);
}

export function createShadowDisc(radius: number): THREE.Mesh {
  return radialDisc(radius, [0, 0, 0], 0.75, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
}

/** Additive pool of the racer's energy colour on the pad (tint via material.color). */
export function createGlowDisc(radius: number): THREE.Mesh {
  return radialDisc(radius, [1, 1, 1], 0.3, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
}
