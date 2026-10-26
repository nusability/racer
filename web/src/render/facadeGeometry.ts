import * as THREE from 'three';

// The kit of shapes a lit facade is drawn on (render/facade.ts). Each is a unit shape standing
// on y = 0 that an instance matrix scales to size, and each carries the `facade` attribute the
// shader lays its windows out by, so a window keeps its size on any shape and any scale:
//   x: where the vertex sits along its face, in unit lengths of the scale axis named by y
//   y: which horizontal scale that is (0: the instance's x scale, 1: its z scale)
//   z: 1 on a wall, 0 on a roof or a floor (no windows there)
//   w: 1 where the face ends in a sharp corner (corner neon can run there), 0 on a round shape

/** Faces round a cylinder or a dome: enough that a tower reads as round at the canyon's distance. */
const ROUND_SEGMENTS = 10;
/** Rings up a dome. */
const DOME_RINGS = 4;
/** The twisted tower: storeys of mesh up it, its twist end to end (radians) and its top's share of the base's width. */
const TWIST_RINGS = 8;
const TWIST_TURN = Math.PI / 2;
const TWIST_TAPER = 0.55;

/** A unit box with its base on y = 0. */
export function facadeBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return withFacade(g, (p, n) => (Math.abs(n.y) > 0.5 ? [0, 0, 0, 1] : Math.abs(n.x) > 0.5 ? [p.z, 1, 1, 1] : [p.x, 0, 1, 1]));
}

/** A unit cylinder (diameter 1) with its base on y = 0: round towers, drums, tanks and stacks. */
export function facadeCylinder(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, ROUND_SEGMENTS, 1).translate(0, 0.5, 0);
  return withFacade(g, (_p, n, u) => (Math.abs(n.y) > 0.5 ? [0, 0, 0, 0] : [roundAlong(u), 0, 1, 0]));
}

/** A half sphere of diameter 1 on y = 0, its crown at y = 0.5: a dome over a drum. */
export function facadeDome(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, ROUND_SEGMENTS, DOME_RINGS, 0, Math.PI * 2, 0, Math.PI / 2);
  return withFacade(g, (_p, _n, u) => [roundAlong(u), 0, 1, 0]);
}

/** A square pyramid with its base on y = 0 and its apex at y = 1: spire crowns and masts. */
export function facadeSpire(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const geo = g.toNonIndexed();
  g.dispose();
  geo.computeVertexNormals();
  return withFacade(geo, (p, n) => (n.y < -0.5 ? [0, 0, 0, 1] : Math.abs(n.x) > Math.abs(n.z) ? [p.z, 1, 1, 1] : [p.x, 0, 1, 1]));
}

/**
 * A square tower turning a quarter turn and narrowing as it rises. Its windows are laid out on
 * the untwisted face, so they follow the twist.
 */
export function facadeTwist(): THREE.BufferGeometry {
  const pos: number[] = [];
  const fac: number[] = [];
  // Each side is a strip of quads up the tower: corner a to corner b of the base square.
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const at = (cx: number, cz: number, t: number): [number, number, number] => {
    const k = 1 - (1 - TWIST_TAPER) * t;
    const a = TWIST_TURN * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [(cx * c - cz * s) * k, t, (cx * s + cz * c) * k];
  };
  for (let side = 0; side < 4; side++) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    // Sides 0 and 2 run along x, 1 and 3 along z (the scale axis their windows take).
    const axis = side % 2;
    const ua = axis === 0 ? ax : az;
    const ub = axis === 0 ? bx : bz;
    for (let r = 0; r < TWIST_RINGS; r++) {
      const t0 = r / TWIST_RINGS;
      const t1 = (r + 1) / TWIST_RINGS;
      const quad = [at(ax, az, t0), at(bx, bz, t0), at(bx, bz, t1), at(ax, az, t1)];
      const us = [ua, ub, ub, ua];
      // Wound so the face points outward.
      for (const i of [0, 2, 1, 0, 3, 2]) {
        pos.push(...quad[i]);
        fac.push(us[i], axis, 1, 1);
      }
    }
  }
  // The roof: the top square.
  const top = corners.map(([cx, cz]) => at(cx, cz, 1));
  for (const i of [0, 2, 1, 0, 3, 2]) {
    pos.push(...top[i]);
    fac.push(0, 0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('facade', new THREE.Float32BufferAttribute(fac, 4));
  g.computeVertexNormals();
  return g;
}

/**
 * Along a round face: the arc in units of the diameter (a unit cylinder's girth is π), from the
 * shape's own u, which runs 0..1 round it with the seam's vertices doubled, so no face spans it.
 */
function roundAlong(u: number): number {
  return (u - 0.5) * Math.PI;
}

function withFacade(g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3, u: number) => [number, number, number, number]): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const out = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    out.set(f(p, n, uv.getX(i)), i * 4);
  }
  g.setAttribute('facade', new THREE.BufferAttribute(out, 4));
  return g;
}
