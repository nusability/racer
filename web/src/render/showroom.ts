// Garage showroom: the selected skimmer idling on a launch pad in a pit garage. It owns its own
// scene and camera but renders through the game's single renderer when the main loop asks.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import type { ShowroomApi } from '../game/types.ts';
import { createRacerModel, type RacerModel, type RacerViewState } from './racerModel.ts';
import { buildShowroomSet, createGlowDisc, createShadowDisc, SHOWROOM_BACKGROUND } from './showroomScenery.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

/** Where the racer must sit on screen (fractions of the viewport, top-left origin): the menu
 * UI covers the rest. Landscape is the centre column of the 3-column garage. */
interface ScreenWindow {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
const PORTRAIT_WINDOW: ScreenWindow = { left: 0, right: 1, top: 0, bottom: 0.6 };
// Matches the garage's clear centre column in landscape (measured at 844×390 and 932×430).
const LANDSCAPE_WINDOW: ScreenWindow = { left: 0.34, right: 0.66, top: 0.18, bottom: 0.78 };

const FOV = 34;
/** Radius (m) of the racer's turning footprint that must fit the window. */
const FIT_RADIUS = 6.3;
/** Seen from slightly above, the turning footprint is shorter on screen than it is wide. */
const FIT_VERTICAL_SLACK = 1.35;
const CAMERA_ELEVATION = 0.2;
const TURN_RATE = 0.32;
const PAD_RADIUS = 6.6;
const PAD_HEIGHT = 0.3;
/** The racer idles: fans spinning, rings lit, cushion shimmering. */
const IDLE_SPEED_FRAC = 0.18;
const IDLE_STEER_SWAY = 0.35;
const IDLE_HEAT = 0.1;
/** What the cushion spray takes its colour from: the pad's brushed metal. */
const PAD_COLOR = 0x9aa0a8;
/** Starting yaw shows the rear three-quarter: the angle players see in the race. */
const START_YAW = Math.PI * 0.2;

export class Showroom implements ShowroomApi {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private readonly turntable = new THREE.Group();
  private readonly models = new Map<string, RacerModel>();
  private readonly padRing: THREE.MeshBasicMaterial;
  private readonly padGlow: THREE.Mesh;
  private readonly disposables: { dispose(): void }[] = [];
  private current: RacerModel | null = null;
  private yaw = START_YAW;
  private isActive = false;
  private readonly view: RacerViewState = {
    speed: IDLE_SPEED_FRAC, topSpeed: 1, boosting: false, heat: IDLE_HEAT, damage: 0, steer: 0,
    airborne: false, crashed: false, groundColor: PAD_COLOR,
  };

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.background = new THREE.Color(SHOWROOM_BACKGROUND);
    this.scene.fog = new THREE.Fog(SHOWROOM_BACKGROUND, 40, 120);
    const set = buildShowroomSet();
    this.scene.add(set.group);
    this.disposables.push(set);

    const hemi = new THREE.HemisphereLight(0xe6ecf5, 0x3a3d44, 1.9);
    const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
    key.position.set(-14, 22, 12);
    const rim = new THREE.DirectionalLight(0x9db8ff, 1.8);
    rim.position.set(16, 10, -24);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(12, 6, 20);
    this.scene.add(hemi, key, rim, fill);

    // Launch pad: a brushed disc with a glowing rim tinted by the racer's energy colour.
    const padGeo = new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS + 0.4, PAD_HEIGHT, 32);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4c525b, roughness: 0.5, metalness: 0.15, flatShading: true });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -PAD_HEIGHT / 2;
    const ringGeo = new THREE.TorusGeometry(PAD_RADIUS - 0.3, 0.06, 4, 72);
    ringGeo.rotateX(Math.PI / 2);
    this.padRing = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo, this.padRing);
    ring.position.y = 0.01;
    const shadow = createShadowDisc(5.2);
    shadow.position.y = 0.02;
    this.padGlow = createGlowDisc(PAD_RADIUS - 0.4);
    this.padGlow.position.y = 0.03;
    this.turntable.position.y = SKIMMER_RIDE_HEIGHT;
    this.scene.add(pad, ring, shadow, this.padGlow, this.turntable);
    this.disposables.push(padGeo, padMat, ringGeo, this.padRing, shadow.geometry, shadow.material as THREE.Material,
      this.padGlow.geometry, this.padGlow.material as THREE.Material);

    const size = renderer.getSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  get active(): boolean {
    return this.isActive;
  }

  show(visual: RacerVisual): void {
    const key = `${visual.style}:${visual.primary}:${visual.secondary}:${visual.accent}:${visual.glow}`;
    let model = this.models.get(key);
    if (!model) {
      model = createRacerModel(visual, { detail: 'high', finish: null });
      this.models.set(key, model);
      this.turntable.add(model.root);
    }
    if (this.current && this.current !== model) this.current.root.visible = false;
    model.root.visible = true;
    this.current = model;
    this.padRing.color.setHex(visual.glow);
    (this.padGlow.material as THREE.MeshBasicMaterial).color.setHex(visual.glow);
    this.isActive = true;
  }

  hide(): void {
    this.isActive = false;
  }

  render(dt: number, time: number): void {
    if (!this.current) return;
    this.yaw += dt * TURN_RATE;
    this.turntable.rotation.y = this.yaw;
    // A lazy steer wobble keeps the flaps alive on the stand.
    this.view.steer = Math.sin(time * 0.7) * IDLE_STEER_SWAY;
    this.current.update(dt, time, this.view);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const win = h >= w ? PORTRAIT_WINDOW : LANDSCAPE_WINDOW;
    const winW = (win.right - win.left) * w;
    const winH = (win.bottom - win.top) * h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Distance at which the footprint radius spans half the window's limiting side.
    const dist = (FIT_RADIUS * h) / (tanHalf * Math.min(winW, winH * FIT_VERTICAL_SLACK));
    this.camera.aspect = w / h;
    this.camera.position.set(0, SKIMMER_RIDE_HEIGHT + dist * CAMERA_ELEVATION, dist);
    this.camera.lookAt(0, SKIMMER_RIDE_HEIGHT, 0);
    // Shift the projection so the frame centre lands on the window centre.
    const cx = (win.left + win.right) / 2;
    const cy = (win.top + win.bottom) / 2;
    this.camera.setViewOffset(w, h, (0.5 - cx) * w, (0.5 - cy) * h, w, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    for (const d of this.disposables) d.dispose();
  }
}
