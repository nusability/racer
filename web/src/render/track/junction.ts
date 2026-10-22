import * as THREE from 'three';
import type { Ribbon, Track } from '../../core/track.ts';
import { BRANCH_JUNCTION_LENGTH } from '../../data/tuning.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import type { Corridor } from './corridor.ts';
import { basisAt, box } from './dressing.ts';
import { decal } from './hazards.ts';
import { quadFacing, rockQuad } from './paint.ts';

// Where a shortcut leaves and rejoins the main road: a sculpted rock nose splitting the two,
// hazard chevrons on its tip, painted arrows into the fork and a lit sign announcing it.

/** The nose wedge: length back from where the walls split, height and the width of its base. */
const NOSE_LENGTH = 26;
const NOSE_HEIGHT = 7;
/** Fork sign: how far ahead of the junction, its height and board size. */
const SIGN_AHEAD = 140;
const SIGN_HEIGHT = 11;
const SIGN_W = 22;
const SIGN_H = 5.5;
/** Painted arrows leading into a fork, metres apart. */
const ARROW_SPACING = 16;

/** UV rectangles of each branch's row on the shared sign texture. */
export interface SignQuads {
  /** Positions/UVs for one textured mesh with every fork sign in it. */
  pos: number[];
  uv: number[];
}

export function buildJunctions(main: Corridor, branches: Corridor[], track: Track, signs: SignQuads): void {
  const J = BRANCH_JUNCTION_LENGTH;
  const r = main.ribbon;
  track.branches.forEach((b, i) => {
    const side = b.side;
    const half = (s: number) => r.widthAt(s) / 2;
    // Noses where the walls split (entry) and meet again (exit).
    nose(main, branches[i], b.entryS + J, side, 1);
    nose(main, branches[i], b.exitS - J, side, -1);
    // Arrows across the main road toward the fork, then along the junction.
    for (let s = b.entryS - 4 * ARROW_SPACING; s < b.entryS + J - 10; s += ARROW_SPACING) {
      const x = side * (half(s) - 7);
      arrow(r, main.glow, s, x, side, s < b.entryS ? 0.55 : 0.25, main.paint.accent);
    }
    // The sign: posts just beyond the boundary, the board cantilevered out over the run-off.
    const sSign = b.entryS - SIGN_AHEAD;
    const k = Math.round(r.wrap(sSign) / r.step);
    const B = basisAt(main, k, side, 0);
    const post = main.paint.black.clone().multiplyScalar(2);
    for (const dx of [2.5, 6]) box(main.chunkAt(sSign).rock, B, side * dx, 0, 0.9, 0.9, -1, SIGN_HEIGHT + 1, post);
    // x is metres outward from the boundary; the board reaches back over the sand.
    const at = (x: number, y: number): P3 => ({ x: B.o.x + B.r.x * side * x, y: B.o.y + y, z: B.o.z + B.r.z * side * x });
    const inner = 6.5 - SIGN_W;
    // Board corners: bottom-left, bottom-right, top-right, top-left as a racer sees them.
    const [xl, xr] = side > 0 ? [inner, 6.5] : [6.5, inner];
    const corners = [at(xl, SIGN_HEIGHT - SIGN_H), at(xr, SIGN_HEIGHT - SIGN_H), at(xr, SIGN_HEIGHT), at(xl, SIGN_HEIGHT)];
    const row = i / track.branches.length;
    const rowH = 1 / track.branches.length;
    // CanvasTexture rows run top-down; flipY puts row 0 at the top of v.
    const v0 = 1 - row - rowH;
    const v1 = 1 - row;
    const uv = [0, v0, 1, v0, 1, v1, 0, v1];
    for (const t of [0, 1, 2, 0, 2, 3]) {
      signs.pos.push(corners[t].x - B.f.x * 0.5, corners[t].y, corners[t].z - B.f.z * 0.5);
      signs.uv.push(uv[t * 2], uv[t * 2 + 1]);
    }
  });
}

/** An arrow painted on the road at (s, x), pointing forward and `lean` of the way sideways. */
function arrow(r: Ribbon, g: FlatBuilder, s: number, x: number, side: number, lean: number, color: THREE.Color) {
  const ang = Math.atan2(side * lean, 1);
  const rot = (ds: number, dx: number): [number, number] => [s + ds * Math.cos(ang) - dx * Math.sin(ang), x + ds * Math.sin(ang) + dx * Math.cos(ang)];
  const L = 9;
  const W = 1.4;
  decal(r, g, [rot(0, -W), rot(0, W), rot(L, W), rot(L, -W)], color);
  decal(r, g, [rot(L - 1, -4.5), rot(L - 1, 4.5), rot(L + 5, 0.3), rot(L + 5, -0.3)], color);
}

/**
 * A wedge of rock filling the split between the main road's wall and the branch's wall, its
 * tip at main s (dir 1: pointing back at oncoming racers; dir -1: trailing the merge).
 */
function nose(main: Corridor, branch: Corridor, s: number, side: number, dir: number) {
  const r = main.ribbon;
  const half = r.widthAt(s) / 2;
  const tip = r.toWorld(s - dir * NOSE_LENGTH * 0.15, side * half, 0);
  // The base spans from the main road edge to the branch road's edge, NOSE_LENGTH further on.
  const sb = s + dir * NOSE_LENGTH;
  const baseMain = r.toWorld(sb, side * half, 0);
  const bs = branch.ribbon.project(baseMain, dir > 0 ? 0 : branch.ribbon.length, 400);
  const baseBranch = branch.ribbon.toWorld(bs.s, -side * (branch.ribbon.widthAt(bs.s) / 2), 0);
  const topTip = { ...tip, y: tip.y + NOSE_HEIGHT * 0.6 };
  const topMain = { ...baseMain, y: baseMain.y + NOSE_HEIGHT };
  const topBranch = { ...baseBranch, y: baseBranch.y + NOSE_HEIGHT };
  const env = main.chunkAt(s).rock;
  const t = r.frameAt(s).tangent;
  const back = { x: -t.x * dir, y: 0, z: -t.z * dir };
  const rr = r.frameAt(s).right;
  const toMain = { x: -rr.x * side, y: 0, z: -rr.z * side };
  rockQuad(env, main.paint, tip, baseMain, topMain, topTip, toMain, 0.9);
  rockQuad(env, main.paint, baseBranch, tip, topTip, topBranch, { x: rr.x * side, y: 0, z: rr.z * side }, 0.9);
  const col = main.paint.strata(topMain.y, 1.05, new THREE.Color());
  env.tri(topTip, topMain, topBranch, col);
  if (dir > 0) env.tri(topTip, topBranch, topMain, col);
  // Chevron panel on the tip, facing oncoming racers: split left and right.
  if (dir > 0) {
    const w = 3.2;
    const h = 3.6;
    const across = { x: rr.x, y: 0, z: rr.z };
    const p = (dx: number, dy: number): P3 => ({ x: tip.x + across.x * dx + back.x * 0.3, y: tip.y + 0.6 + dy, z: tip.z + across.z * dx + back.z * 0.3 });
    quadFacing(main.glow, p(-w, 0), p(w, 0), p(w, h), p(-w, h), back, main.paint.black);
    for (const sgn of [-1, 1]) {
      for (let c = 0; c < 2; c++) {
        const x0 = sgn * (0.5 + c * 1.3);
        quadFacing(main.glow, p(x0, 0.3), p(x0 + sgn * 0.6, 0.3), p(x0 + sgn * 1.2, h / 2), p(x0 + sgn * 0.6, h / 2), back, main.paint.hazard);
        quadFacing(main.glow, p(x0 + sgn * 0.6, h / 2), p(x0 + sgn * 1.2, h / 2), p(x0 + sgn * 0.6, h - 0.3), p(x0, h - 0.3), back, main.paint.hazard);
      }
    }
  }
}
