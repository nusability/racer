import * as THREE from 'three';
import { Track, type Ribbon } from '../../../core/track.ts';
import type { TrackDef } from '../../../core/types.ts';
import { worldOfTrack } from '../../../data/worlds.ts';
import { pixelRatioFor } from '../../graphics.ts';
import { GRAPHICS_PROFILE, type GraphicsLevel } from '../../graphicsTuning.ts';
import { resolveLook, type LookFlags } from '../../look/look.ts';
import { PostFx } from '../../look/postFx.ts';
import { applyEnvironment, buildTrackScene, type TrackScene } from '../../trackScene.ts';
import { FOG_FAR, atmosphere } from '../config.ts';

// The level viewer's 3D side: one renderer for the page's life, and one track scene at a time
// that is built, and fully disposed before the next one, the way a race session does it.

/** Chase-cam field of view, as the race draws it. */
const FOV = 72;
const NEAR = 0.5;
/** The far plane sits past the fog so the fogged horizon is never clipped. */
const FAR_MARGIN = 300;
/** Terrain more than this above the road or run-off counts as a sand bank you fly through. */
const GROUND_RISE_MAX = 0.5;

export interface StageSettings {
  level: GraphicsLevel;
  look: LookFlags;
}

interface Built {
  track: Track;
  scene: TrackScene;
  env: { dispose(): void };
  post: PostFx | null;
  buildMs: number;
}

export class Stage {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FOG_FAR.high + FAR_MARGIN);
  private built: Built | null = null;
  private readonly roadUp = new THREE.Vector3();
  /** Screen area the panel covers on the right and at the bottom, CSS px. */
  private inset = { right: 0, bottom: 0 };

  constructor(parent: HTMLElement) {
    parent.prepend(this.renderer.domElement);
  }

  get track(): Track {
    return this.current().track;
  }

  get trackScene(): TrackScene {
    return this.current().scene;
  }

  get buildMs(): number {
    return this.current().buildMs;
  }

  private current(): Built {
    if (!this.built) throw new Error('level viewer: no track built yet');
    return this.built;
  }

  /** Builds `def` at these settings, disposing whatever was built before. */
  build(def: TrackDef, settings: StageSettings): void {
    this.disposeBuilt();
    const t0 = performance.now();
    const r = this.renderer;
    const quality = GRAPHICS_PROFILE[settings.level].detail;
    r.setPixelRatio(pixelRatioFor(settings.level, window.devicePixelRatio));
    const air = atmosphere(quality);
    this.camera.far = air.fog.far + FAR_MARGIN;
    const track = new Track(def);
    const env = applyEnvironment(this.scene, def.palette, air);
    const look = resolveLook(worldOfTrack(def.id).biome, settings.level, settings.look, PostFx.supported(r), def.palette);
    // Without a render target the materials tone-map themselves on the way to the canvas.
    r.toneMapping = look && !look.post ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = look && !look.post ? look.look.grade.materialExposure : 1;
    const post = look?.post
      ? new PostFx(r, {
          bloom: look.bloom ? look.look.bloom : null,
          bloomShift: look.bloomShift,
          grade: look.look.grade,
          boostBlur: null,
          wet: look.wetReflections ? look.look.wetRoad : null,
          haze: look.heatHaze ? look.look.heatHaze : null,
          aa: look.aa,
        })
      : null;
    const scene = buildTrackScene(track, quality, look);
    this.scene.add(scene.group);
    this.built = { track, scene, env, post, buildMs: performance.now() - t0 };
    this.resize();
    // Ground audit: terrain must never stand in the drivable width (a craft would fly through it).
    const hits = scene.auditGround(GROUND_RISE_MAX);
    if (hits.length > 0) {
      const h = hits[0];
      console.error(`ground audit: ${hits.length} spots stand over ${GROUND_RISE_MAX}m above the drivable surface, first at branch ${h.branch} s=${h.s.toFixed(0)} x=${h.x} (+${h.rise.toFixed(1)}m)`);
    }
  }

  private disposeBuilt(): void {
    const b = this.built;
    if (!b) return;
    this.scene.remove(b.scene.group);
    b.scene.dispose();
    b.env.dispose();
    b.post?.dispose();
    this.built = null;
  }

  /** The panel covers this much of the window; the view's centre moves to the part left clear. */
  setInset(right: number, bottom: number): void {
    if (right === this.inset.right && bottom === this.inset.bottom) return;
    this.inset = { right, bottom };
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    // The canvas fills the window behind the panel; a view offset puts the projection centre
    // (and the field of view) on the clear part, so the spot you look at is not under the panel.
    const cw = Math.max(1, w - this.inset.right);
    const ch = Math.max(1, h - this.inset.bottom);
    this.camera.aspect = cw / ch;
    if (this.inset.right > 0 || this.inset.bottom > 0) this.camera.setViewOffset(cw, ch, 0, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.built?.post?.resize();
  }

  /** One frame. `ribbon` and `s` give the road under the camera, which wet reflections mirror about. */
  draw(dt: number, ribbon: Ribbon, s: number): void {
    const post = this.built?.post;
    if (!post) return this.renderer.render(this.scene, this.camera);
    const up = ribbon.frameAt(s).up;
    post.render(this.scene, this.camera, { dt, boosting: false, speedFrac: 0, roadUp: this.roadUp.set(up.x, up.y, up.z), curling: ribbon.isMagnet(s) });
  }
}
