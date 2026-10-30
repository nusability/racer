// The camera of the player's wreck: it takes over from the chase camera where that left off and
// rides with the debris (the mass-weighted centre of the parts) as it tumbles and skids on,
// pulling back as the parts spread, swinging to a three-quarter view, then orbiting once it has
// come to rest. Falling into the void, it follows the debris down for a moment, then holds.
//
// The debris integrates once per display frame (racerWreck.ts), so the camera follows the
// frame's state with exact exponential springs: the same path at any frame rate. It stays out
// of walls, tunnel ceilings and the road by clamping in track space, as the chase camera does.

import * as THREE from 'three';
import type { Ribbon } from '../core/track.ts';
import { makeFrame, type Frame } from '../core/track.ts';
import type { Vec3 } from '../core/types.ts';
import type { DebrisView } from './racerWreck.ts';
import {
  CAM_CEILING_MARGIN,
  CAM_PORTRAIT_FOV_SCALE,
  CAM_WALL_MARGIN,
  WRECK_CAM_AIM_FOLLOW,
  WRECK_CAM_CLEARANCE,
  WRECK_CAM_DISTANCE,
  WRECK_CAM_FLIGHT_ANGLE,
  WRECK_CAM_FLOOR_UP,
  WRECK_CAM_FOLLOW,
  WRECK_CAM_FOV,
  WRECK_CAM_FOV_BLEND,
  WRECK_CAM_HEIGHT,
  WRECK_CAM_MAX_DISTANCE,
  WRECK_CAM_MAX_PITCH,
  WRECK_CAM_ORBIT_RATE,
  WRECK_CAM_PROJECT_STEPS,
  WRECK_CAM_REST_SPEED,
  WRECK_CAM_SPREAD_LIFT,
  WRECK_CAM_SPREAD_PULLBACK,
  WRECK_CAM_SWING_RATE,
  WRECK_CAM_UP_BLEND,
  WRECK_CAM_VOID_FOLLOW,
} from './cameraTuning.ts';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class WreckCamera {
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly aimVel = new THREE.Vector3();
  /** Horizontal direction from the camera to the debris at the impact: "behind" for the shot. */
  private readonly heading = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly desiredVel = new THREE.Vector3();
  private readonly held = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly frame = makeFrame();
  private readonly frame2 = makeFrame();
  private readonly world: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly local = { s: 0, x: 0, y: 0 };
  private ribbon: Ribbon | null = null;
  /** Where along the road the debris is: the start of every walk that places a point on it. */
  private sDebris = 0;
  /** +1 or −1: which way the swing and orbit turn about the debris (see begin()). */
  private side = 1;
  private swing = 0;
  private orbit = 0;
  /** 0 while the debris flies, rising to 1 as it comes to rest; it never falls back. */
  private settle = 0;
  private age = 0;
  private holding = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /**
   * Take over from the camera's current pose. `ribbon` and `s`: the road the player was on and
   * where, at the impact; `debris`: the parts just after they let go.
   */
  begin(ribbon: Ribbon, s: number, debris: DebrisView): void {
    this.ribbon = ribbon;
    this.sDebris = s;
    this.pos.copy(this.camera.position);
    // The camera rides on with the debris' momentum instead of stopping dead at the impact; the
    // springs follow in the debris' moving frame, so they never fall behind it.
    this.vel.copy(debris.velocity);
    this.camera.getWorldDirection(this.tmp);
    this.aim.copy(this.pos).addScaledVector(this.tmp, this.pos.distanceTo(debris.centre));
    this.aimVel.copy(debris.velocity);
    this.heading.subVectors(debris.centre, this.pos).setY(0);
    // The chase camera trails along the road and above it: those can't both be vertical.
    if (this.heading.lengthSq() === 0) throw new Error('WreckCamera: the camera is straight above the craft');
    this.heading.normalize();
    this.toTrack(debris.centre);
    // A swing of the offset −heading turns it along (−h.z, h.x). Toward the middle of the road,
    // where there is room; off an open edge, out over the void with the debris instead, or the
    // deck it fell past would hide it.
    const fr = ribbon.frameAt(this.local.s, this.frame);
    const turn = -this.heading.z * fr.right.x + this.heading.x * fr.right.z;
    const outward = this.local.x > 0 ? 1 : -1;
    this.side = (debris.falling ? outward : -outward) * (turn < 0 ? -1 : 1);
    this.swing = 0;
    this.orbit = 0;
    this.settle = 0;
    this.age = 0;
    // A craft that fell a long way before it was lost is already far off: following it down
    // would fly the camera through the course. It stays where the chase camera watched from.
    this.holding = debris.falling && this.pos.distanceTo(debris.centre) > WRECK_CAM_MAX_DISTANCE;
    this.held.copy(this.pos);
  }

  /** `dt`: simulated (slowed) seconds, the debris' clock; `real`: display seconds. */
  update(dt: number, real: number, debris: DebrisView): void {
    if (!this.ribbon) throw new Error('WreckCamera.update before begin');
    this.age += dt;
    this.toTrack(debris.centre);
    this.sDebris = this.local.s;

    const rest = debris.resting ? 1 : Math.max(0, 1 - debris.velocity.length() / WRECK_CAM_REST_SPEED);
    this.settle = Math.max(this.settle, rest);
    this.swing += (WRECK_CAM_FLIGHT_ANGLE - this.swing) * (1 - Math.exp(-WRECK_CAM_SWING_RATE * real));
    this.orbit += WRECK_CAM_ORBIT_RATE * this.settle * real;

    if (debris.falling && (this.holding || this.age >= WRECK_CAM_VOID_FOLLOW)) {
      // Let it fall away: the camera eases to a stop where it is and watches.
      if (!this.holding) this.held.copy(this.desired);
      this.holding = true;
      this.desired.copy(this.held);
      this.desiredVel.set(0, 0, 0);
    } else {
      this.desiredVel.copy(debris.velocity);
      const distance = Math.min(WRECK_CAM_MAX_DISTANCE, WRECK_CAM_DISTANCE + WRECK_CAM_SPREAD_PULLBACK * debris.spread);
      const angle = this.side * (this.swing + this.orbit);
      this.tmp.copy(this.heading).applyAxisAngle(WORLD_UP, angle);
      this.desired.copy(debris.centre).addScaledVector(this.tmp, -distance);
      this.desired.y += WRECK_CAM_HEIGHT + WRECK_CAM_SPREAD_LIFT * debris.spread;
      this.constrain(this.desired);
    }

    spring(this.pos, this.vel, this.desired, this.desiredVel, WRECK_CAM_FOLLOW, dt);
    this.constrain(this.pos);
    spring(this.aim, this.aimVel, debris.centre, debris.velocity, WRECK_CAM_AIM_FOLLOW, dt);

    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.up.lerp(WORLD_UP, 1 - Math.exp(-WRECK_CAM_UP_BLEND * real)).normalize();
    // Past the steepest pitch the debris drops out of the bottom of the frame instead.
    this.look.subVectors(this.aim, this.pos);
    const flat = Math.hypot(this.look.x, this.look.z);
    const rise = flat * Math.tan(WRECK_CAM_MAX_PITCH);
    this.look.y = Math.max(-rise, Math.min(rise, this.look.y));
    cam.lookAt(this.look.add(this.pos));
    const fov = cam.aspect < 1 ? WRECK_CAM_FOV * CAM_PORTRAIT_FOV_SCALE : WRECK_CAM_FOV;
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-WRECK_CAM_FOV_BLEND * real));
    cam.updateProjectionMatrix();
  }

  /**
   * Keep p out of the walls, under a tunnel's ceiling and above a road it is over. Off an open
   * edge nothing holds it: that is the void.
   */
  private constrain(p: THREE.Vector3): void {
    const ribbon = this.ribbon!;
    this.toTrack(p);
    const { s } = this.local;
    let { x, y } = this.local;
    const smp = ribbon.sampleAt(s);
    const covered = Number.isFinite(smp.ceiling);
    if (covered) y = Math.min(y, smp.ceiling - CAM_CEILING_MARGIN);
    const minX = ribbon.minXAt(s);
    const maxX = ribbon.maxXAt(s);
    // A wall holds the camera up to its height, or all the way up inside a tunnel.
    const walled = (side: -1 | 1) => !ribbon.dropAt(s, side) && (covered || y < smp.wallHeight);
    if (x < minX + CAM_WALL_MARGIN && walled(-1)) x = minX + CAM_WALL_MARGIN;
    if (x > maxX - CAM_WALL_MARGIN && walled(1)) x = maxX - CAM_WALL_MARGIN;
    const up = ribbon.frameAt(s, this.frame).up;
    if (x >= minX && x <= maxX && !smp.gap && up.y >= WRECK_CAM_FLOOR_UP) y = Math.max(y, WRECK_CAM_CLEARANCE);
    if (x === this.local.x && y === this.local.y) return;
    ribbon.toWorld(s, x, y, this.world, this.frame);
    p.set(this.world.x, this.world.y, this.world.z);
  }

  /**
   * p in the debris' road's track space, into `local`: a walk along the road from where the
   * debris is, so it never jumps to another pass of the road (a loop's far side, a bridge).
   */
  private toTrack(p: THREE.Vector3): void {
    const ribbon = this.ribbon!;
    let s = this.sDebris;
    let fr: Frame = this.frame;
    for (let k = 0; k < WRECK_CAM_PROJECT_STEPS; k++) {
      fr = ribbon.frameAt(s, this.frame);
      const along = (p.x - fr.pos.x) * fr.tangent.x + (p.y - fr.pos.y) * fr.tangent.y + (p.z - fr.pos.z) * fr.tangent.z;
      // A metre of s is not always a metre of road (inside a loop it is more).
      // Measured forward, or backward at the end of an open ribbon, where forward is clamped.
      const ds = ribbon.closed || s + ribbon.step <= ribbon.length ? ribbon.step : -ribbon.step;
      const next = ribbon.frameAt(s + ds, this.frame2).pos;
      const stretch = Math.hypot(next.x - fr.pos.x, next.y - fr.pos.y, next.z - fr.pos.z) / ribbon.step;
      s = ribbon.wrap(s + along / stretch);
    }
    fr = ribbon.frameAt(s, this.frame);
    const dx = p.x - fr.pos.x;
    const dy = p.y - fr.pos.y;
    const dz = p.z - fr.pos.z;
    this.local.s = s;
    this.local.x = dx * fr.right.x + dy * fr.right.y + dz * fr.right.z;
    this.local.y = dx * fr.up.x + dy * fr.up.y + dz * fr.up.z;
  }
}

/**
 * One exact step of a critically damped spring toward a target moving at `targetVel`, solved in
 * the target's frame: following debris at a steady speed it trails by nothing, and it smooths only
 * the changes (bounces, the swing, the pull-back). `target` is where it is at the end of the step.
 */
function spring(x: THREE.Vector3, v: THREE.Vector3, target: THREE.Vector3, targetVel: THREE.Vector3, omega: number, dt: number): void {
  const e = Math.exp(-omega * dt);
  for (const k of ['x', 'y', 'z'] as const) {
    // Relative to where the target was at the start of the step.
    const d = x[k] - (target[k] - targetVel[k] * dt);
    const u = v[k] - targetVel[k];
    const c = u + omega * d;
    x[k] = target[k] + (d + c * dt) * e;
    v[k] = targetVel[k] + (u - omega * c * dt) * e;
  }
}
