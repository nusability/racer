// Garage showroom: the selected racer idling on a hover pad at dusk in the dunes. It owns its own
// scene and camera but renders through the game's single renderer when the main loop asks.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import type { ShowroomApi } from '../game/types.ts';
import { createRacerModel, type RacerModel, type RacerViewState } from './racerModel.ts';
import { buildShowroomBackdrop, createGlowDisc, createShadowDisc, SHOWROOM_FOG } from './showroomScenery.ts';

const FOV = 36;
/** Radius (m) of the racer's turning footprint that must fit the free part of the screen. */
const FIT_RADIUS = 6.8;
/** Share of the screen the racer gets: the menu UI covers the rest. */
const FREE_SHARE = 0.6;
const CAMERA_ELEVATION = 0.11;
const TURN_RATE = 0.32;
const HOVER_HEIGHT = 1.7;
const PAD_RADIUS = 6.8;
/** The racer idles: engines lit, flames short, binder crackling. */
const IDLE_SPEED_FRAC = 0.18;
const IDLE_STEER_SWAY = 0.35;
/** Starting yaw shows the rear three-quarter: the angle players see in the race. */
const START_YAW = Math.PI * 0.2;

export class Showroom implements ShowroomApi {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 900);
  private readonly turntable = new THREE.Group();
  private readonly models = new Map<string, RacerModel>();
  private readonly padRing: THREE.MeshBasicMaterial;
  private readonly padGlow: THREE.Mesh;
  private readonly disposables: { dispose(): void }[] = [];
  private current: RacerModel | null = null;
  private visual: RacerVisual | null = null;
  private yaw = START_YAW;
  private isActive = false;
  private readonly view: RacerViewState = {
    speed: 0, topSpeed: 1, boosting: false, heat: 0.1, overheated: false, damage: 0, steer: 0, airborne: false, crashed: false,
  };

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.fog = new THREE.Fog(SHOWROOM_FOG, 80, 520);
    const backdrop = buildShowroomBackdrop();
    this.scene.add(backdrop.group);
    this.disposables.push(backdrop);

    const hemi = new THREE.HemisphereLight(0xffd2b0, 0x7a5236, 1.5);
    const key = new THREE.DirectionalLight(0xffb27a, 2.6);
    key.position.set(-30, 22, -40);
    const rim = new THREE.DirectionalLight(0x8fa8ff, 1.5);
    rim.position.set(35, 18, 30);
    const fill = new THREE.DirectionalLight(0xffe6cc, 0.7);
    fill.position.set(10, 30, 40);
    this.scene.add(hemi, key, rim, fill);

    // Pad: a dark low-poly disc with a glowing rim tinted by the racer's energy colour.
    const padGeo = new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS + 0.6, 0.5, 18);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.45, metalness: 0.3, flatShading: true });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -0.25;
    const ringGeo = new THREE.TorusGeometry(PAD_RADIUS - 0.35, 0.07, 4, 64);
    ringGeo.rotateX(Math.PI / 2);
    this.padRing = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo, this.padRing);
    ring.position.y = 0.02;
    const shadow = createShadowDisc(5.5);
    shadow.position.y = 0.03;
    this.padGlow = createGlowDisc(PAD_RADIUS - 0.5);
    this.padGlow.position.y = 0.04;
    this.scene.add(pad, ring, shadow, this.padGlow, this.turntable);
    this.turntable.position.y = HOVER_HEIGHT;
    this.disposables.push(padGeo, padMat, ringGeo, this.padRing, shadow.geometry, shadow.material as THREE.Material,
      this.padGlow.geometry, this.padGlow.material as THREE.Material);

    this.camera.lookAt(0, 0, 0);
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
      model = createRacerModel(visual, { detail: 'high' });
      this.models.set(key, model);
      this.turntable.add(model.root);
    }
    if (this.current && this.current !== model) this.current.root.visible = false;
    model.root.visible = true;
    this.current = model;
    this.visual = visual;
    this.padRing.color.setHex(visual.glow);
    (this.padGlow.material as THREE.MeshBasicMaterial).color.setHex(visual.glow);
    this.isActive = true;
  }

  hide(): void {
    this.isActive = false;
  }

  render(dt: number, time: number): void {
    if (!this.current || !this.visual) return;
    this.yaw += dt * TURN_RATE;
    this.turntable.rotation.y = this.yaw;
    const v = this.view;
    v.topSpeed = 1;
    v.speed = IDLE_SPEED_FRAC;
    // A lazy steer wobble keeps the flaps and the pod alive on the stand.
    v.steer = Math.sin(time * 0.7) * IDLE_STEER_SWAY;
    this.current.update(dt, time, v);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const portrait = h >= w;
    const freeW = portrait ? w : w * FREE_SHARE;
    const freeH = portrait ? h * FREE_SHARE : h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Distance so the footprint fits the free box (seen from above-ish, height counts less).
    const dist = (FIT_RADIUS * h) / (tanHalf * Math.min(freeW, freeH * 1.3));
    this.camera.aspect = w / h;
    this.camera.position.set(0, HOVER_HEIGHT + dist * CAMERA_ELEVATION, dist);
    this.camera.lookAt(0, HOVER_HEIGHT, 0);
    // Shift the projection so the racer centres in the free area (top band or left band).
    const shift = (1 - FREE_SHARE) / 2;
    if (portrait) this.camera.setViewOffset(w, h, 0, h * shift, w, h);
    else this.camera.setViewOffset(w, h, w * shift, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    for (const d of this.disposables) d.dispose();
  }
}
