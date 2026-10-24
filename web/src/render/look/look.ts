import type { TrackPalette } from '../../core/types.ts';
import type { BiomeId } from '../../data/worlds.ts';
import type { GraphicsLevel } from '../graphicsTuning.ts';
import { LOOK_BUDGET, type AaMode, type WorldLook } from './lookTuning.ts';
import { WORLD_LOOK } from './worldLooks.ts';

// Which parts of a world's look are live in a race: what the world opts into, cut by what the
// graphics level affords, cut by the per-device debug switches (so the owner can A/B each
// effect, and its frame rate, on his phone), cut by what the GPU can render into.

/** Per-device switches from the hidden debug menu; they only switch effects off. */
export interface LookFlags {
  /** Master switch: off draws an opted-in world exactly as before the look pass. */
  world: boolean;
  post: boolean;
  bloom: boolean;
  /** 'level' keeps the graphics level's anti-aliasing; a mode forces it wherever the level has a post pass. */
  aa: 'level' | AaMode;
  blur: boolean;
  wet: boolean;
  gliders: boolean;
  ao: boolean;
  haze: boolean;
}

/** The designed look, every effect on: what a device runs until someone switches one off. */
export const LOOK_FLAGS_ON: LookFlags = { world: true, post: true, bloom: true, aa: 'level', blur: true, wet: true, gliders: true, ao: true, haze: true };

export interface ActiveLook {
  look: WorldLook;
  /** Render-target pipeline; when off, tone mapping runs in the materials and nothing below that needs it is on. */
  post: boolean;
  bloom: boolean;
  /** Where the bloom chain starts (LookBudget.bloomShift). */
  bloomShift: number;
  aa: AaMode;
  boostBlur: boolean;
  heatHaze: boolean;
  wetReflections: boolean;
  wetSheen: boolean;
  gliders: boolean;
  ao: boolean;
  /** The look's water (sky reflection, HDR glints); its glints are for the bloom, so it goes with the post pipeline. */
  sea: boolean;
}

/**
 * The live look for a world, or null when the world has none (or the master switch is off):
 * then nothing about the race's rendering changes. `canPost` is whether the GPU can render
 * into half-float targets (PostFx.supported). `palette` is the track's: a world's look follows its light.
 */
export function resolveLook(biome: BiomeId, level: GraphicsLevel, flags: LookFlags, canPost: boolean, palette: TrackPalette): ActiveLook | null {
  const lookFor = WORLD_LOOK[biome];
  if (!lookFor || !flags.world) return null;
  const look = lookFor(palette);
  const b = LOOK_BUDGET[level];
  if (b.post && flags.post && !canPost) console.warn('look: no half-float render targets on this GPU; post-processing is off (tone mapping runs in the materials)');
  const post = b.post && flags.post && canPost;
  const bloom = post && b.bloom && flags.bloom;
  return {
    look,
    post,
    bloom,
    bloomShift: b.bloomShift,
    aa: !post || b.aa === 'off' ? 'off' : flags.aa === 'level' ? b.aa : flags.aa,
    boostBlur: post && b.boostBlur && flags.blur,
    heatHaze: post && b.heatHaze && flags.haze && look.heatHaze !== null && look.heatHaze.amount > 0,
    // The reflections are drawn from the bloom chain's blurred lights; a dry world has none.
    wetReflections: bloom && b.wetReflections && flags.wet && look.wetRoad.reflection > 0,
    wetSheen: b.wetSheen && flags.wet,
    gliders: b.gliders && flags.gliders,
    ao: b.ao && flags.ao,
    sea: post && look.sea !== null,
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
    a.heatHaze && 'haze',
    a.sea && 'sea',
    a.wetReflections ? 'wet' : a.wetSheen && 'sheen',
    a.gliders && 'env',
    a.ao && 'ao',
  ];
  return on.filter((x) => x).join(' ');
}
