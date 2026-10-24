import * as THREE from 'three';
import type { Ribbon } from '../../../core/track.ts';

// The level viewer's camera: chase (fly), orbit, top and free fly, and the touch and mouse
// gestures that steer them. Touch uses touch events (as src/ui/input.ts does: iOS needs the
// touchstart blocked to stop scroll, zoom and the magnifier); mouse and pen use pointer events.

export const VIEW_MODES = ['fly', 'orbit', 'top', 'free'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export function isViewMode(v: string): v is ViewMode {
  return (VIEW_MODES as readonly string[]).includes(v);
}

/** Glider's-eye height over the road: where a racer's craft rides. */
const RACER_HEIGHT = 2.2;
/** Chase-cam offset behind and above the racer position, and how far ahead it looks. */
const CAM_BACK = 9;
const CAM_UP = 3.6;
const LOOK_AHEAD = 60;
/** Orbit: radians per dragged pixel, the pitch range (just under the horizon to near straight down), and the zoom range in metres. */
const ORBIT_RATE = 0.005;
const PITCH_MIN = -0.2;
const PITCH_MAX = 1.5;
const DIST_MIN = 10;
const DIST_MAX = 3000;
/** Wheel zoom: share of the distance per wheel delta unit. */
const WHEEL_ZOOM = 0.001;
/** The top view stands this many orbit distances over the spot. */
const TOP_HEIGHT = 4;
/** Free fly: look radians per dragged pixel, and how far up or down it may look (just short of straight). */
const LOOK_RATE = 0.004;
const LOOK_PITCH_MAX = 1.5;
/** Free fly cruise speed at full stick (m/s, a brisk inspection pace), and the FAST multiplier (race pace). */
export const FREE_SPEED = 40;
export const FREE_FAST = 5;

export interface Orbit {
  yaw: number;
  pitch: number;
  dist: number;
}

/** Free-fly stick: forward and strafe in -1..1 (joystick or keys), rise in -1..1 (buttons or keys). */
export interface FlyStick {
  forward: number;
  strafe: number;
  rise: number;
  fast: boolean;
}

export class CameraRig {
  view: ViewMode;
  readonly orbit: Orbit = { yaw: 0.6, pitch: 0.35, dist: 140 };
  readonly free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  readonly stick: FlyStick = { forward: 0, strafe: 0, rise: 0, fast: false };
  /** Called when a gesture changes the view mode (a drag in chase view starts orbiting). */
  onViewChange: (v: ViewMode) => void = () => {};
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly keys = new Set<string>();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    view: ViewMode,
  ) {
    this.view = view;
  }

  setView(v: ViewMode): void {
    if (v === 'free' && this.view !== 'free') this.takeFreePose();
    this.view = v;
    this.onViewChange(v);
  }

  /** Free fly starts where the camera is, looking where it looks. */
  private takeFreePose(): void {
    const d = this.camera.getWorldDirection(this.fwd);
    this.free.pos.copy(this.camera.position);
    this.free.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    this.free.yaw = Math.atan2(d.x, -d.z);
  }

  /** Places the camera for the spot at (s, lateral) on `ribbon`; free fly moves by `dt` instead. */
  place(ribbon: Ribbon, s: number, lateral: number, dt: number): void {
    const cam = this.camera;
    if (this.view === 'free') return this.placeFree(dt);
    const at = ribbon.toWorld(s, lateral, RACER_HEIGHT);
    if (this.view === 'fly') {
      const p = ribbon.toWorld(s - CAM_BACK, lateral, CAM_UP);
      cam.position.set(p.x, p.y, p.z);
      const l = ribbon.toWorld(s + LOOK_AHEAD, lateral * 0.5, RACER_HEIGHT);
      this.look.set(l.x, l.y, l.z);
      const up = ribbon.frameAt(s).up;
      cam.up.set(up.x, up.y, up.z);
    } else if (this.view === 'top') {
      cam.position.set(at.x, at.y + this.orbit.dist * TOP_HEIGHT, at.z + 1);
      this.look.set(at.x, at.y, at.z);
      cam.up.set(0, 1, 0);
    } else {
      const o = this.orbit;
      cam.position.set(
        at.x + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
        at.y + Math.sin(o.pitch) * o.dist,
        at.z + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
      );
      this.look.set(at.x, at.y, at.z);
      cam.up.set(0, 1, 0);
    }
    cam.lookAt(this.look);
  }

  private placeFree(dt: number): void {
    const f = this.free;
    const k = this.keys;
    const axis = (neg: string, pos: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    const forward = clamp1(this.stick.forward + axis('KeyS', 'KeyW'));
    const strafe = clamp1(this.stick.strafe + axis('KeyA', 'KeyD'));
    const rise = clamp1(this.stick.rise + axis('KeyQ', 'KeyE'));
    const speed = FREE_SPEED * (this.stick.fast || k.has('ShiftLeft') ? FREE_FAST : 1) * dt;
    this.fwd.set(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
    this.side.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
    f.pos.addScaledVector(this.fwd, forward * speed).addScaledVector(this.side, strafe * speed);
    f.pos.y += rise * speed;
    const cam = this.camera;
    cam.position.copy(f.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look.copy(f.pos).add(this.fwd));
  }

  /** A drag of (dx, dy) pixels: orbits, or looks round in free fly. Chase and top views start orbiting. */
  drag(dx: number, dy: number): void {
    if (this.view === 'free') {
      this.free.yaw += dx * LOOK_RATE;
      this.free.pitch = Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, this.free.pitch - dy * LOOK_RATE));
      return;
    }
    if (this.view !== 'orbit') this.setView('orbit');
    this.orbit.yaw -= dx * ORBIT_RATE;
    this.orbit.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.orbit.pitch + dy * ORBIT_RATE));
  }

  /** Zoom by a factor (pinch or wheel): >1 moves away. Free fly moves forward instead. */
  zoom(factor: number): void {
    if (this.view === 'free') {
      this.fwd.set(Math.sin(this.free.yaw) * Math.cos(this.free.pitch), Math.sin(this.free.pitch), -Math.cos(this.free.yaw) * Math.cos(this.free.pitch));
      this.free.pos.addScaledVector(this.fwd, (1 - factor) * FREE_SPEED);
      return;
    }
    this.orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, this.orbit.dist * factor));
  }

  /** Wires gestures on the canvas and free-fly keys on the window. */
  attach(el: HTMLElement): void {
    const touches = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (touches.size === 2) pinch = spread();
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (touches.size === 1) {
          const t = e.changedTouches[0];
          const p = touches.get(t.identifier);
          if (!p) return;
          this.drag(t.clientX - p.x, t.clientY - p.y);
        }
        for (const t of e.changedTouches) {
          const p = touches.get(t.identifier);
          if (p) {
            p.x = t.clientX;
            p.y = t.clientY;
          }
        }
        if (touches.size === 2) {
          const d = spread();
          if (pinch > 0 && d > 0) this.zoom(pinch / d);
          pinch = d;
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
      // A finger lifted out of a pinch: the other one must not jump into a drag.
      pinch = touches.size === 2 ? spread() : 0;
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    let mouse: { id: number; x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      mouse = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!mouse || e.pointerId !== mouse.id) return;
      this.drag(e.clientX - mouse.x, e.clientY - mouse.y);
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (mouse && e.pointerId === mouse.id) mouse = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(1 + e.deltaY * WHEEL_ZOOM);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
