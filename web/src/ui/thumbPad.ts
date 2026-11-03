// The one-thumb gauge's geometry, apart from the DOM so it runs headless (tools/throttle-check.ts):
// how big the glass pad is, where it stands while the thumb steers, and how it is trimmed to stay
// on screen and clear of the HUD. The drawing is thumbGauge.ts. Screen y grows down.
import { ONE_THUMB_SWIPE_MM } from './oneThumb.ts';
import type { SwipeThresholds } from './throttleSwipe.ts';

/**
 * Sideways travel the pad shows each way of its centre. At sensitivity 1 a 15 mm slide moves the
 * craft about 40 m (input.ts: 50 m per 120 px), most of a 50 m road: the steering a race uses.
 * A thumb that slides farther drags the pad along, as an overshoot drags the throttle's neutral.
 */
export const PAD_STEER_MM = 15;
/**
 * Room between the travel and the rim on every side, so a thumb at full steer or full reach still
 * sits on the glass rather than on its edge.
 */
export const PAD_MARGIN_MM = 3;
/**
 * Room kept between the pad and the screen's edge, the minimap or the speed and bars, so the rim
 * reads as its own line and never as part of them.
 */
export const PAD_CLEARANCE_PX = 8;

/** A box in CSS px. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PadSize {
  /** Half the pad's width and height, px. */
  halfW: number;
  halfH: number;
  /** The sideways travel shown each way, px. */
  steer: number;
  /** CSS px per mm of thumb travel at this scale, for the gauge's other sizes. */
  mm: number;
}

/**
 * The pad for these swipe thresholds. Their reach is ONE_THUMB_SWIPE_MM.reach of thumb travel at
 * the screen's density, already shrunk on a squat window (throttleSwipe.ts), so it says what a
 * millimetre is here and the pad keeps its proportion to the thumb's travel.
 */
export function padSize(t: SwipeThresholds): PadSize {
  const mm = t.reach / ONE_THUMB_SWIPE_MM.reach;
  const steer = PAD_STEER_MM * mm;
  const margin = PAD_MARGIN_MM * mm;
  return { halfW: steer + margin, halfH: t.reach + margin, steer, mm };
}

/** The pad's centre on one axis, trailing a finger that strays more than `travel` from it. */
export function trail(centre: number, finger: number, travel: number): number {
  if (finger - centre > travel) return finger - travel;
  if (centre - finger > travel) return finger + travel;
  return centre;
}

const area = (b: Box) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);

function overlapArea(a: Box, b: Box): number {
  return area({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
}

/**
 * The part of the pad that is drawn: `pad` cut back to the screen, then, for each box it must
 * keep clear of, along one edge. Cutting rather than moving keeps every band where the throttle
 * really is. Only a box wholly to one side of the centre (neutral) is cut away, and never nearer
 * neutral than `keep`, so neutral always shows: a box too near is cut back as far as that allows,
 * and a box under neutral itself is left, under the thumb as it is. Of the cuts, the one that
 * leaves the least of the box under the pad wins, then the one that keeps the most glass. One cut
 * a box: a second, along the other axis, would take a whole band to clear a corner.
 */
export function fitPad(pad: Box, screen: Box, clear: readonly Box[], centre: { x: number; y: number }, keep: number): Box {
  const g = PAD_CLEARANCE_PX;
  let b: Box = {
    left: Math.max(pad.left, screen.left + g),
    top: Math.max(pad.top, screen.top + g),
    right: Math.min(pad.right, screen.right - g),
    bottom: Math.min(pad.bottom, screen.bottom - g),
  };
  for (const o of clear) {
    const near = { left: o.left - g, top: o.top - g, right: o.right + g, bottom: o.bottom + g };
    const under = (c: Box) => overlapArea(c, near);
    if (under(b) === 0) continue;
    const cuts: Box[] = [];
    if (near.bottom < centre.y) cuts.push({ ...b, top: Math.max(b.top, Math.min(near.bottom, centre.y - keep)) });
    if (near.top > centre.y) cuts.push({ ...b, bottom: Math.min(b.bottom, Math.max(near.top, centre.y + keep)) });
    if (near.right < centre.x) cuts.push({ ...b, left: Math.max(b.left, Math.min(near.right, centre.x - keep)) });
    if (near.left > centre.x) cuts.push({ ...b, right: Math.min(b.right, Math.max(near.left, centre.x + keep)) });
    if (cuts.length > 0) b = cuts.reduce((best, c) => (under(c) < under(best) || (under(c) === under(best) && area(c) > area(best)) ? c : best));
  }
  return b;
}
