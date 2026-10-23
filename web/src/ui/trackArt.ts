// Track preview art for the menus: the pre-rendered thumbnail (public/thumbs, made by
// tools/thumbs.mjs) and a small white outline of the course.
//
// A world arrives in stages (data, then tracks, then thumbs), so the menus must render a track
// that has no thumbnail yet, or isn't built yet: such a track shows its world's gradient and,
// when unbuilt, is offered as "coming soon" rather than breaking the screen.
import type { TrackDef } from '../core/types.ts';
import thumbs from '../data/trackThumbs.json';
import { TRACKS } from '../data/tracks/index.ts';
import { worldOfTrack } from '../data/worlds.ts';
import { h } from './kit.ts';

interface ThumbEntry {
  image: string;
  outline: number[][];
  branches: number[][][];
}

const THUMBS: Record<string, ThumbEntry> = thumbs;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The track's definition, or null while the tracks agent hasn't built it yet. */
export function trackIfBuilt(trackId: string): TrackDef | null {
  return TRACKS.find((t) => t.id === trackId) ?? null;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The preview image; decorative, the card's label names the track. */
export function trackThumb(trackId: string, cls: string): HTMLElement {
  const t = THUMBS[trackId];
  if (!t) {
    const { from, to } = worldOfTrack(trackId).card;
    const swatch = h('span', `${cls} thumb--pending`);
    swatch.style.background = `linear-gradient(160deg, ${hex(from)}, ${hex(to)})`;
    return swatch;
  }
  const img = h('img', cls);
  img.src = t.image;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  return img;
}

/** The course outline (shortcuts dashed) as an inline SVG in a 0..100 box. */
export function trackOutline(trackId: string, cls: string): SVGSVGElement | null {
  const t = THUMBS[trackId];
  if (!t) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-6 -6 112 112');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const line = (pts: number[][], closed: boolean, dashed: boolean) => {
    const el = document.createElementNS(SVG_NS, closed ? 'polygon' : 'polyline');
    el.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    if (dashed) el.setAttribute('class', 'is-branch');
    svg.append(el);
  };
  line(t.outline, true, false);
  for (const b of t.branches) line(b, false, true);
  return svg;
}
