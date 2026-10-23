// Track preview art for the menus: the pre-rendered thumbnail (public/thumbs, made by
// tools/thumbs.mjs) and a small white outline of the course.
import thumbs from '../data/trackThumbs.json';
import { h } from './kit.ts';

interface ThumbEntry {
  image: string;
  outline: number[][];
  branches: number[][][];
}

const THUMBS: Record<string, ThumbEntry> = thumbs;
const SVG_NS = 'http://www.w3.org/2000/svg';

function entry(trackId: string): ThumbEntry {
  const t = THUMBS[trackId];
  if (!t) throw new Error(`No thumbnail for track "${trackId}": run node tools/thumbs.mjs`);
  return t;
}

/** The preview image; decorative, the card's label names the track. */
export function trackThumb(trackId: string, cls: string): HTMLImageElement {
  const img = h('img', cls);
  img.src = entry(trackId).image;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  return img;
}

/** The course outline (shortcuts dashed) as an inline SVG in a 0..100 box. */
export function trackOutline(trackId: string, cls: string): SVGSVGElement {
  const t = entry(trackId);
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
