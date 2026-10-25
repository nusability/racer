import * as THREE from 'three';
import { mulberry32, range } from '../core/rng.ts';
import { RACERS } from '../data/racers.ts';
import { trackById } from '../data/tracks/index.ts';
import { worldOfTrack } from '../data/worlds.ts';
import { pixelRatioFor } from './graphics.ts';
import {
  BENCH_BATCHES,
  BENCH_BATCH_FRAMES_MAX,
  BENCH_BATCH_FRAMES_MIN,
  BENCH_BATCH_MS,
  BENCH_CAM_BACK,
  BENCH_CAM_UP,
  BENCH_FOV,
  BENCH_FRAME_TIME,
  BENCH_GLIDERS,
  BENCH_GLIDER_GAP,
  BENCH_GLIDER_SPREAD,
  BENCH_GLIDER_HOVER,
  BENCH_PALETTE_TRACK,
  BENCH_ROAD_WIDTH,
  BENCH_SEED,
  BENCH_STREET_LENGTH,
  BENCH_TOWERS,
  BENCH_TOWER_HEIGHT,
  BENCH_TOWER_SETBACK,
  BENCH_TOWER_SIZE,
  BENCH_TOWER_TINTS,
  BENCH_LOOK_AHEAD,
  BENCH_MAX_MS,
  BENCH_START_S,
  BENCH_STEP_S,
  BENCH_COMPILE_SIZE,
  BENCH_WARMUP_FRAMES,
  GRAPHICS_PROFILE,
} from './graphicsTuning.ts';
import { worldEnvironment } from './look/env.ts';
import { LOOK_FLAGS_ON, resolveLook } from './look/look.ts';
import { PostFx } from './look/postFx.ts';
import { createRacerModel, type RacerModel } from './racerModel.ts';
import { CULL_MARGIN, atmosphere } from './track/config.ts';
import { applyEnvironment } from './trackScene.ts';
import { CITY_NEON, facadeBox, facadeMaterial } from './facade.ts';

// Measures what this device's GPU can draw, without the player doing anything: a city street
// built from the race's own parts (graphicsTuning.ts says why not a whole track), at the top
// level (the ultra look, the screen's real size and ultra's render scale), on a canvas that is
// never shown.
//
// requestAnimationFrame is capped at the display's refresh, so frame rate cannot tell a fast
// GPU from a middling one. Instead each batch draws frames back to back inside one task and
// sets a fence after them: the wall time until the GPU passes it, over the frames, is what a
// frame costs. The fence is polled between tasks, so the page keeps answering input while the
// GPU works, and a device too slow to wait for is cut off as soon as it is clearly low.

/** Lets the page run (input, the title's animation) between the benchmark's steps. */
function nextTask(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => (signal.aborted ? reject(signal.reason) : resolve()), 0);
  });
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface BenchmarkResult {
  /** Wall ms per frame: the median of the batches, or a lower bound when cut off. */
  ms: number;
  /** The device was cut off as clearly low before its frames finished. */
  lowerBound: boolean;
}

/**
 * Runs the benchmark. A device too slow to wait for is cut off as soon as it is past medium's
 * limit, which is all the level needs. Rejects with `signal.reason` when aborted.
 */
export async function runBenchmark(signal: AbortSignal): Promise<BenchmarkResult> {
  await nextTask(signal);
  const canvas = document.createElement('canvas');
  // As the game's canvas is made (main.ts), so the default framebuffer costs what it does there.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const disposers: (() => void)[] = [() => renderer.dispose(), () => renderer.forceContextLoss()];
  try {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(pixelRatioFor('ultra', window.devicePixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    const gl = renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) throw new Error('graphics benchmark: needs WebGL2 fences');
    const bench = buildScene(renderer, disposers);

    /**
     * Ms from `t0` until the GPU has done everything submitted so far; once past `capMs` it
     * stops waiting, and the ms so far are returned as a lower bound.
     */
    const gpuDone = async (t0: number, capMs: number): Promise<{ ms: number; done: boolean }> => {
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!fence) throw new Error('graphics benchmark: fenceSync failed');
      gl.flush();
      try {
        for (;;) {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.WAIT_FAILED) throw new Error('graphics benchmark: clientWaitSync failed');
          const elapsed = performance.now() - t0;
          if (status !== gl.TIMEOUT_EXPIRED) return { ms: elapsed, done: true };
          if (elapsed > capMs) return { ms: elapsed, done: false };
          await nextTask(signal);
        }
      } finally {
        gl.deleteSync(fence);
      }
    };
    let frame = 0;
    /** Ms per frame over `n` frames; cut off (a lower bound) once they are clearly low: no need to wait for them. */
    const timed = async (n: number): Promise<BenchmarkResult> => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) bench.draw(frame++);
      const t = await gpuDone(t0, n * BENCH_MAX_MS.medium);
      return { ms: t.ms / n, lowerBound: !t.done };
    };

    await nextTask(signal);
    // Compile the scene's shaders off the clock. Where the driver compiles in parallel, wait for
    // it without blocking; elsewhere the compile starts now and the first frame waits for it.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(bench.scene, bench.camera);
    else renderer.compile(bench.scene, bench.camera);
    await nextTask(signal);
    // The first frame compiles whatever is left (the post passes; everything where the driver
    // cannot compile in parallel) and uploads every buffer and texture: drawn tiny, and not timed.
    renderer.setSize(BENCH_COMPILE_SIZE, BENCH_COMPILE_SIZE, false);
    bench.resize();
    bench.draw(frame++);
    await gpuDone(performance.now(), Infinity);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    bench.resize();

    const result = await (async (): Promise<BenchmarkResult> => {
      await nextTask(signal);
      const warm = await timed(BENCH_WARMUP_FRAMES);
      if (warm.lowerBound) return warm;
      const n = Math.min(BENCH_BATCH_FRAMES_MAX, Math.max(BENCH_BATCH_FRAMES_MIN, Math.round(BENCH_BATCH_MS / warm.ms)));
      const batches: number[] = [];
      for (let b = 0; b < BENCH_BATCHES; b++) {
        await nextTask(signal);
        const t = await timed(n);
        if (t.lowerBound) return t;
        batches.push(t.ms);
      }
      return { ms: median(batches), lowerBound: false };
    })();
    // Releasing resources the GPU is still drawing with blocks the page until it is done, so
    // frames cut off are left to finish first, without blocking.
    await gpuDone(performance.now(), Infinity);
    return result;
  } finally {
    for (const d of disposers.reverse()) d();
  }
}

interface BenchScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Draws frame `k` of the fly-through. */
  draw(k: number): void;
  /** Call after the drawing buffer's size changes. */
  resize(): void;
}

/** Builds the street; everything it makes is released through `disposers`. */
function buildScene(renderer: THREE.WebGLRenderer, disposers: (() => void)[]): BenchScene {
  const def = trackById(BENCH_PALETTE_TRACK);
  const palette = def.palette;
  const detail = GRAPHICS_PROFILE.ultra.detail;
  const scene = new THREE.Scene();
  const air = atmosphere(detail, worldOfTrack(def.id).biome);
  const env = applyEnvironment(scene, palette, air);
  disposers.push(() => env.dispose());
  // Every effect of the world's look, as the ultra level draws it; the debug switches are the
  // owner's A/B on one device and do not change what the device can do.
  const look = resolveLook(worldOfTrack(def.id).biome, 'ultra', LOOK_FLAGS_ON, PostFx.supported(renderer), palette);
  if (look && !look.post) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = look.look.grade.exposure;
  }
  const post = look?.post
    ? new PostFx(renderer, {
        bloom: look.bloom ? look.look.bloom : null,
        bloomShift: look.bloomShift,
        grade: look.look.grade,
        boostBlur: look.boostBlur ? look.look.boostBlur : null,
        wet: look.wetReflections ? look.look.wetRoad : null,
        haze: look.heatHaze ? look.look.heatHaze : null,
        aa: look.aa,
      })
    : null;
  if (post) disposers.push(() => post.dispose());
  const gliderEnv = look?.gliders ? worldEnvironment(renderer, look.look.env, look.look.sunDir) : null;
  if (gliderEnv) disposers.push(() => gliderEnv.dispose());
  const finish = gliderEnv && look ? { envMap: gliderEnv.texture, look: look.look.gliders } : null;

  // The street runs from the origin along -Z, the way a model's nose points.
  const roadGeo = new THREE.PlaneGeometry(BENCH_ROAD_WIDTH, BENCH_STREET_LENGTH).rotateX(-Math.PI / 2).translate(0, 0, -BENCH_STREET_LENGTH / 2);
  const roadMat = new THREE.MeshLambertMaterial({ color: palette.road });
  scene.add(new THREE.Mesh(roadGeo, roadMat));
  const towerGeo = facadeBox();
  const ao = look?.ao ? look.look.ao : null;
  const towerMat = facadeMaterial({ palette, neon: CITY_NEON, baseShade: ao ? { amount: ao.buildingBase, height: ao.buildingHeight } : null });
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, BENCH_TOWERS);
  const rng = mulberry32(BENCH_SEED);
  const m = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (let i = 0; i < BENCH_TOWERS; i++) {
    const w = range(rng, ...BENCH_TOWER_SIZE);
    const d = range(rng, ...BENCH_TOWER_SIZE);
    const side = i % 2 ? 1 : -1;
    const x = side * (BENCH_ROAD_WIDTH / 2 + range(rng, ...BENCH_TOWER_SETBACK) + w / 2);
    m.makeScale(w, range(rng, ...BENCH_TOWER_HEIGHT), d).setPosition(x, 0, -rng() * BENCH_STREET_LENGTH);
    towers.setMatrixAt(i, m);
    towers.setColorAt(i, tint.set(BENCH_TOWER_TINTS[i % BENCH_TOWER_TINTS.length]));
  }
  towers.computeBoundingSphere();
  scene.add(towers);
  disposers.push(() => [roadGeo, roadMat, towerGeo, towerMat].forEach((x) => x.dispose()));

  const gliders: RacerModel[] = [];
  for (let i = 0; i < BENCH_GLIDERS; i++) {
    const g = createRacerModel(RACERS[i % RACERS.length].visual, { detail: 'high', finish });
    gliders.push(g);
    scene.add(g.root);
  }
  disposers.push(() => gliders.forEach((g) => g.dispose()));

  const camera = new THREE.PerspectiveCamera(BENCH_FOV, window.innerWidth / window.innerHeight, 0.5, air.cull + CULL_MARGIN);
  const roadUp = new THREE.Vector3(0, 1, 0);
  const run = BENCH_STREET_LENGTH - 2 * BENCH_START_S;
  const draw = (k: number) => {
    const s = BENCH_START_S + ((k * BENCH_STEP_S) % run);
    camera.position.set(0, BENCH_CAM_UP, -(s - BENCH_CAM_BACK));
    camera.lookAt(0, BENCH_CAM_UP, -(s + BENCH_LOOK_AHEAD));
    gliders.forEach((g, i) => g.root.position.set((i % 2 ? 1 : -1) * BENCH_GLIDER_SPREAD, BENCH_GLIDER_HOVER, -(s + BENCH_GLIDER_GAP * i)));
    if (!post) return renderer.render(scene, camera);
    post.render(scene, camera, { dt: BENCH_FRAME_TIME, boosting: true, speedFrac: 1, roadUp, curling: false });
  };
  return { scene, camera, draw, resize: () => post?.resize() };
}
