import type { BiomeId } from '../../data/worlds.ts';
import type { Quality } from '../track/config.ts';
import { LOOK_BUDGET, WORLD_LOOK, type AaMode, type WorldLook } from './lookTuning.ts';

// Which parts of a world's look are live in a race: what the world opts into, cut by what the
// quality level affords, cut by the per-device debug switches (so the owner can A/B each
// effect, and its frame rate, on his phone), cut by what the GPU can render into.

/** Per-device switches from the hidden debug menu; they only switch effects off. */
export interface LookFlags {
  /** Master switch: off draws an opted-in world exactly as before the look pass. */
  world: boolean;
  post: boolean;
  bloom: boolean;
  aa: AaMode;
  blur: boolean;
  wet: boolean;
  gliders: boolean;
  ao: boolean;
}

/** The designed look, every effect on: what a device runs until someone switches one off. */
export const LOOK_FLAGS_ON: LookFlags = { world: true, post: true, bloom: true, aa: 'fxaa', blur: true, wet: true, gliders: true, ao: true };

export interface ActiveLook {
  look: WorldLook;
  /** Render-target pipeline; when off, tone mapping runs in the materials and nothing below that needs it is on. */
  post: boolean;
  bloom: boolean;
  aa: AaMode;
  boostBlur: boolean;
  wetReflections: boolean;
  wetSheen: boolean;
  gliders: boolean;
  ao: boolean;
}

/**
 * The live look for a world, or null when the world has none (or the master switch is off):
 * then nothing about the race's rendering changes. `canPost` is whether the GPU can render
 * into half-float targets (PostFx.supported).
 */
export function resolveLook(biome: BiomeId, quality: Quality, flags: LookFlags, canPost: boolean): ActiveLook | null {
  const look = WORLD_LOOK[biome];
  if (!look || !flags.world) return null;
  const b = LOOK_BUDGET[quality];
  if (b.post && flags.post && !canPost) console.warn('look: no half-float render targets on this GPU; post-processing is off (tone mapping runs in the materials)');
  const post = b.post && flags.post && canPost;
  const bloom = post && b.bloom && flags.bloom;
  return {
    look,
    post,
    bloom,
    aa: post && b.aa ? flags.aa : 'off',
    boostBlur: post && b.boostBlur && flags.blur,
    // The reflections are drawn from the bloom chain's blurred lights.
    wetReflections: bloom && b.wetReflections && flags.wet,
    wetSheen: b.wetSheen && flags.wet,
    gliders: b.gliders && flags.gliders,
    ao: b.ao && flags.ao,
  };
}

/** One line for the perf readout: which effects this race is paying for. */
export function describeLook(a: ActiveLook | null): string {
  if (!a) return 'look off';
  const on = [
    a.post ? 'post' : 'tonemap',
    a.bloom && 'bloom',
    a.aa !== 'off' && a.aa,
    a.boostBlur && 'blur',
    a.wetReflections ? 'wet' : a.wetSheen && 'sheen',
    a.gliders && 'env',
    a.ao && 'ao',
  ];
  return on.filter((x) => x).join(' ');
}
