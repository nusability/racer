import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { AaMode, BloomLook, BoostBlurLook, GradeLook, HeatHazeLook, WetRoadLook } from './lookTuning.ts';
import { COMPOSITE_FRAGMENT, DOWN_FRAGMENT, FULLSCREEN_VERTEX, PREFILTER_FRAGMENT, UP_FRAGMENT } from './postShaders.ts';

// A hand-rolled minimal composer, cheaper than three's EffectComposer + UnrealBloomPass (which
// blurs five mips in two separable passes each, and copies between passes):
//
//   scene → HDR target (half float; MSAA when chosen)
//   bloom: bright pass to 1/2 (by default), dual-filter down to 1/4, 1/8, … and back up to 1/4
//   composite (one pass): heat haze, boost blur, + bloom, + wet-road reflections, ACES, grade, sRGB
//   FXAA (when chosen) on the display-referred result
//
// The HUD is DOM above the canvas, so none of this touches it.

/** MSAA samples on the scene target when anti-aliasing is 'msaa' (tile GPUs resolve it on chip). */
const MSAA_SAMPLES = 4;
/** Boost blur taps along the radial line (the centre tap included). */
const BLUR_TAPS = 6;
/** Wet-road reflection taps along each smear. */
const WET_TAPS = 5;
/** Below this length the road's horizon line is off screen at infinity (looking straight down): no reflections that frame. */
const HORIZON_MIN = 1e-4;

export interface PostOptions {
  bloom: BloomLook | null;
  /** The bloom chain starts at 1/2^shift of the drawing buffer (LookBudget.bloomShift). */
  bloomShift: number;
  grade: GradeLook;
  boostBlur: BoostBlurLook | null;
  wet: WetRoadLook | null;
  haze: HeatHazeLook | null;
  aa: AaMode;
}

export interface PostFrame {
  dt: number;
  boosting: boolean;
  /** Speed over top speed. */
  speedFrac: number;
  /** World up of the road under the camera: the plane wet reflections mirror about. */
  roadUp: THREE.Vector3;
  /** 1 while the road under or just ahead of the camera curls (loop, corkscrew), else 0. */
  curling: boolean;
}

function hdrTarget(samples: number, depth: boolean): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: depth,
    samples,
  });
}

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false });
}

export class PostFx {
  /** Whether the GPU can render into half-float targets (iOS Safari WebGL2 exposes this through EXT_color_buffer_half_float). */
  static supported(renderer: THREE.WebGLRenderer): boolean {
    return renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
  }

  private readonly sceneRT: THREE.WebGLRenderTarget;
  private readonly down: THREE.WebGLRenderTarget[] = [];
  private readonly up: THREE.WebGLRenderTarget[] = [];
  private readonly ldrRT: THREE.WebGLRenderTarget | null;
  private readonly quad = new FullScreenQuad();
  private readonly prefilter: THREE.ShaderMaterial | null = null;
  private readonly downMat: THREE.ShaderMaterial | null = null;
  private readonly upMat: THREE.ShaderMaterial | null = null;
  private readonly composite: THREE.ShaderMaterial;
  private readonly fxaa: THREE.ShaderMaterial | null;
  private readonly size = new THREE.Vector2();
  private readonly bloomShift: number;
  private readonly nv = new THREE.Vector3();
  private boost = 0;
  /** Eased 1 on flat road, 0 where the road curls: the mirrored reflections fade with it. */
  private flat = 1;
  /** Seconds since the race began drawing: the haze's noise drifts with it. */
  private time = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly opts: PostOptions,
  ) {
    this.sceneRT = hdrTarget(opts.aa === 'msaa' ? MSAA_SAMPLES : 0, true);
    const g = opts.grade;
    const defines: Record<string, string | number> = { BLUR_TAPS, WET_TAPS };
    const b = opts.bloom;
    this.bloomShift = opts.bloomShift;
    // The deepest level stays where `levels` puts it below half resolution whatever the shift,
    // so the glow reaches as far at every graphics level: a later start is just fewer passes.
    const count = b ? b.levels + 2 - opts.bloomShift : 0;
    if (b) {
      if (b.levels < 2) throw new Error(`look: bloom needs at least 2 levels below half resolution, got ${b.levels}`);
      if (count < 2) throw new Error(`look: bloom starting at 1/${2 ** opts.bloomShift} resolution leaves ${count} levels for ${b.levels} below half; it needs 2`);
      // down[0] is the chain's start (1/2^shift); each further level halves again. up[i] matches down[i + 1].
      for (let i = 0; i < count; i++) this.down.push(hdrTarget(0, false));
      for (let i = 2; i < count; i++) this.up.push(hdrTarget(0, false));
      this.prefilter = pass(PREFILTER_FRAGMENT, {
        tInput: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: b.threshold },
        uKnee: { value: b.knee },
        uClamp: { value: b.clamp },
      });
      this.downMat = pass(DOWN_FRAGMENT, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
      this.upMat = pass(UP_FRAGMENT, { tInput: { value: null }, tSame: { value: null }, uTexel: { value: new THREE.Vector2() } });
      defines.BLOOM = 1;
    }
    if (opts.boostBlur) defines.BOOST_BLUR = 1;
    if (opts.wet) {
      // Reflections are drawn from the blurred glow, so they need the bloom chain (resolveLook ties them).
      if (!b) throw new Error('look: wet-road reflections need bloom');
      defines.WET = 1;
    }
    const uniforms: Record<string, THREE.IUniform> = {
      tScene: { value: this.sceneRT.texture },
      tBloom: { value: null },
      // The glow sums every level of the chain: divide so `strength` means the same at any level count.
      uBloom: { value: b ? b.strength / (count - 1) : 0 },
      uExposure: { value: g.exposure },
      uLift: { value: new THREE.Vector3(...g.lift) },
      uGamma: { value: new THREE.Vector3(...g.gamma) },
      uGain: { value: new THREE.Vector3(...g.gain) },
      uSaturation: { value: g.saturation },
      uAspect: { value: 1 },
      uBlur: { value: 0 },
      uHorizon: { value: new THREE.Vector3() },
      uWet: { value: 0 },
      uHaze: { value: 0 },
      uTime: { value: 0 },
    };
    if (opts.boostBlur) {
      const bb = opts.boostBlur;
      Object.assign(uniforms, { uBlurInner: { value: bb.inner }, uBlurOuter: { value: bb.outer }, uChroma: { value: bb.chroma } });
    }
    if (opts.wet) Object.assign(uniforms, { uSmear: { value: opts.wet.smear }, uNearShare: { value: opts.wet.nearShare }, uHorizonFade: { value: opts.wet.horizonFade } });
    if (opts.haze) {
      defines.HAZE = 1;
      Object.assign(uniforms, { uHazeBand: { value: opts.haze.band }, uHazeAbove: { value: opts.haze.above }, uHazeScale: { value: opts.haze.scale }, uHazeRise: { value: opts.haze.rise } });
    }
    this.composite = pass(COMPOSITE_FRAGMENT, uniforms, defines);
    if (opts.aa === 'fxaa') {
      this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
      this.fxaa = new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false });
    } else {
      this.ldrRT = null;
      this.fxaa = null;
    }
    this.resize();
  }

  /** Call after the canvas or pixel ratio changes: targets follow the drawing buffer. */
  resize(): void {
    const s = this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, s.x);
    const h = Math.max(1, s.y);
    this.sceneRT.setSize(w, h);
    const k = this.bloomShift;
    this.down.forEach((t, i) => t.setSize(Math.max(1, w >> (i + k)), Math.max(1, h >> (i + k))));
    this.up.forEach((t, i) => t.setSize(Math.max(1, w >> (i + k + 1)), Math.max(1, h >> (i + k + 1))));
    this.ldrRT?.setSize(w, h);
    this.fxaa?.uniforms.resolution.value.set(1 / w, 1 / h);
    this.composite.uniforms.uAspect.value = w / h;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, f: PostFrame): void {
    const r = this.renderer;
    // The readout counts every pass of the frame, not just the last one drawn.
    const autoReset = r.info.autoReset;
    r.info.reset();
    r.info.autoReset = false;

    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const u = this.composite.uniforms;
    if (this.prefilter && this.downMat && this.upMat) u.tBloom.value = this.bloom(this.prefilter, this.downMat, this.upMat);

    const bb = this.opts.boostBlur;
    if (bb) {
      this.boost += ((f.boosting ? 1 : 0) - this.boost) * (1 - Math.exp(-bb.response * f.dt));
      const fast = THREE.MathUtils.smoothstep(f.speedFrac, bb.speedFrom, 1);
      u.uBlur.value = bb.reach * this.boost * fast;
    }
    const wet = this.opts.wet;
    const haze = this.opts.haze;
    // Both lie along the road's horizon line; looking straight down there is none, and neither shows.
    const onScreen = wet || haze ? this.horizon(camera, f.roadUp) : false;
    if (haze) {
      this.time += f.dt;
      u.uTime.value = this.time;
      u.uHaze.value = onScreen ? haze.amount : 0;
    }
    if (wet) {
      this.flat += ((f.curling ? 0 : 1) - this.flat) * (1 - Math.exp(-wet.curlResponse * f.dt));
      u.uWet.value = onScreen ? wet.reflection * this.flat : 0;
    }

    this.quad.material = this.composite;
    r.setRenderTarget(this.ldrRT);
    this.quad.render(r);
    if (this.fxaa && this.ldrRT) {
      this.fxaa.uniforms.tDiffuse.value = this.ldrRT.texture;
      this.quad.material = this.fxaa;
      r.setRenderTarget(null);
      this.quad.render(r);
    }
    r.setRenderTarget(null);
    r.info.autoReset = autoReset;
  }

  /** Runs the glow chain and returns the result the composite adds (1/4 resolution at the default shift). */
  private bloom(pre: THREE.ShaderMaterial, down: THREE.ShaderMaterial, up: THREE.ShaderMaterial): THREE.Texture {
    const r = this.renderer;
    const texel = (m: THREE.ShaderMaterial, t: THREE.WebGLRenderTarget) => m.uniforms.uTexel.value.set(1 / t.width, 1 / t.height);
    pre.uniforms.tInput.value = this.sceneRT.texture;
    texel(pre, this.sceneRT);
    this.quad.material = pre;
    r.setRenderTarget(this.down[0]);
    this.quad.render(r);
    this.quad.material = down;
    for (let i = 1; i < this.down.length; i++) {
      down.uniforms.tInput.value = this.down[i - 1].texture;
      texel(down, this.down[i - 1]);
      r.setRenderTarget(this.down[i]);
      this.quad.render(r);
    }
    this.quad.material = up;
    let src = this.down[this.down.length - 1];
    for (let i = this.up.length - 1; i >= 0; i--) {
      up.uniforms.tInput.value = src.texture;
      up.uniforms.tSame.value = this.down[i + 1].texture;
      texel(up, src);
      r.setRenderTarget(this.up[i]);
      this.quad.render(r);
      src = this.up[i];
    }
    return src.texture;
  }

  /**
   * The road plane's horizon (vanishing line) on screen, as a·p + c = 0 over p = (u·aspect, v),
   * with |a| = 1 and the side below the horizon negative. False when it is degenerate.
   */
  private horizon(camera: THREE.PerspectiveCamera, roadUp: THREE.Vector3): boolean {
    camera.updateMatrixWorld();
    const n = this.nv.copy(roadUp).transformDirection(camera.matrixWorldInverse);
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // A view ray through NDC (x, y) is (x·tx, y·ty, −1) with tx = ty·aspect; it meets the plane's
    // horizon where n·ray = 0. With x = 2u − 1 = 2p.x/aspect − 1 and y = 2v − 1:
    const a = 2 * n.x * ty;
    const b = 2 * n.y * ty;
    const c = -n.x * ty * camera.aspect - n.y * ty - n.z;
    const len = Math.hypot(a, b);
    if (len < HORIZON_MIN) return false;
    this.composite.uniforms.uHorizon.value.set(a / len, b / len, c / len);
    return true;
  }

  dispose(): void {
    this.sceneRT.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.ldrRT?.dispose();
    for (const m of [this.prefilter, this.downMat, this.upMat, this.composite, this.fxaa]) m?.dispose();
    this.quad.dispose();
  }
}
