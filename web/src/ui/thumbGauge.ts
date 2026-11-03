// The one-thumb gauge: a see-through glass pad centred on where the finger landed, showing both
// of its axes. The steering travel runs across it, the throttle's boost band glows above and its
// brake band below, a crosshair runs through the finger and a ring in the state colour marks it.
// A lattice of light points wakes around the finger, and the whole pad dissolves away from it,
// so it reads as light over the road, never a box on it. Its geometry is thumbPad.ts.
//
// One small 2D canvas, the size of the pad, moved with a transform. The lattice is drawn once into
// two layers, again only when the pad's size or the tank changes. A frame then only copies them
// and fills with gradients centred on the finger, every pass painting over what is there: the
// dissolve is in the gradients, not a mask pass over the canvas, which on a phone that rasters
// canvas on the CPU would cost more than all the rest.
import type { SwipeThresholds, ThrottleState } from './throttleSwipe.ts';
import type { Box, PadSize } from './thumbPad.ts';

/** A fingertip's contact patch is about 10 mm across; a ring 11 mm across peeks out round it. */
const RING_MM = 5.5;
const RING_LINE_PX = 2;
/** The ring's see-through fill, under its solid line. */
const RING_FILL_ALPHA = 0.2;
/** Corners a little rounder than the HUD's panels (--radius, 14 px, is ~2.2 mm on a phone). */
const CORNER_MM = 3;
/** Point spacing: fine enough to read as a field across the pad, coarse enough to read as points. */
const LATTICE_MM = 1.5;
/** A point far from the finger is a hairline speck; by the finger, a bead. */
const DOT_FAR_PX = 0.8;
const DOT_NEAR_PX = 2;
/** Points wake within one steering slide of the finger (thumbPad.ts, PAD_STEER_MM). */
const WAKE_MM = 15;
/**
 * The wake is laid as discs of the bright lattice, each this much more opaque, the smallest at the
 * finger: the points are a lattice, so each takes one of a few brightnesses and steps never show.
 * A few image fills cost the main thread less than a path of the few hundred points would.
 */
const WAKE_STEPS = 4;
const WAKE_STEP_ALPHA = 0.32;
/**
 * The dark wash behind the bands and points: enough to lift them off bright sand, light enough
 * that the road reads through. A blur would frost it better but costs a full-screen pass a frame.
 */
const TINT_ALPHA = 0.3;
/** The bands' glow by the finger, at rest and held. */
const BAND_ALPHA = 0.34;
const BAND_HELD_ALPHA = 0.5;
/** The enter lines, which mark where each band starts by position as well as by colour. */
const ENTER_LINE_ALPHA = 0.75;
const RIM_ALPHA = 0.55;
const CROSS_ALPHA = 0.45;
/** Resting points, woken points at the finger, and the held zone's points across the pad. */
const DOT_REST_ALPHA = 0.18;
const DOT_NEAR_ALPHA = 1;
const DOT_HELD_ALPHA = 0.4;
/**
 * Every part of the glass fades from full by the ring to this share of itself this far from the
 * finger: about half the pad's width, so with the finger at neutral its sides are already faint.
 * The share stays, so the pad's extent remains readable.
 */
const DISSOLVE_MM = 18;
const DISSOLVE_FLOOR = 0.22;
/** Hatching of the boost band while the tank is dry (as the pad's hollow boost zone). */
const HATCH_PX = 6;
/** The dashed rim stands just outside the hairline one, and shows only by the finger. */
const DASH_PX: number[] = [3, 5];
const DASH_OUTSET_PX = 3;
const CHEVRON_PX = 5;
/** The arrows sit out in the pad's dissolved part, a reminder of the way rather than a readout. */
const CHEVRON_ALPHA = 0.35;
const LABEL_PX = 13;
const LABEL_GAP_PX = 4;
/** A dark edge round the label, so it reads on bright sand without a blurred shadow. */
const LABEL_OUTLINE_PX = 3;
const LABEL_OUTLINE_ALPHA = 0.6;
/**
 * Backing pixels per CSS px at most: a third device pixel on a 3× phone costs 2.25× the fill for
 * hairlines nobody can tell apart at arm's length.
 */
const MAX_DPR = 2;

type Rgb = readonly [number, number, number];
type Held = 'boost' | 'brake';
const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** A colour token from tokens.css, as RGB; a token that is missing or not #rrggbb fails loud. */
function token(name: string): Rgb {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (!m) throw new Error(`thumbGauge: colour token ${name} is "${v}", want #rrggbb (tokens.css)`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('thumbGauge: no 2D canvas context');
  return ctx;
}

export interface ThumbView {
  state: ThrottleState;
  /** The finger, px from the pad's centre. */
  dx: number;
  dy: number;
  /** The part of the pad drawn (thumbPad.ts, fitPad), px from its centre. */
  box: Box;
  /** The side away from the thumb's hand (-1 left, 1 right), for a label with no room above. */
  away: -1 | 1;
  /** Px from the finger up to the top of the screen. */
  roomAbove: number;
}

export interface ThumbGauge {
  el: HTMLCanvasElement;
  /** Lays the pad out; its layers are drawn again only when something they show changed. */
  size(pad: PadSize, t: SwipeThresholds): void;
  /** Stands the pad's centre at (x, y) in its parent, px. */
  place(x: number, y: number): void;
  draw(v: ThumbView): void;
  /** Returns true when it changed, so a pad on screen is drawn again. */
  showTankEmpty(empty: boolean): boolean;
}

/** Fills and strokes that fade with distance from the finger, built about the origin. */
interface Fades {
  tint: CanvasGradient;
  band: Record<Held, CanvasGradient>;
  held: Record<Held, CanvasGradient>;
  enter: Record<Held, CanvasGradient>;
  rim: CanvasGradient;
  cross: CanvasGradient;
  dash: CanvasGradient;
}

/** Everything size() works out, in the pad's centre coordinates. */
interface Layout {
  pad: PadSize;
  enter: number;
  reach: number;
  dpr: number;
  swell: boolean;
  ringR: number;
  corner: number;
  wakeR: number;
  /** The canvas reaches past the pad by this much, for the ring and its label: whole device px. */
  bleedX: number;
  bleedY: number;
  fades: Fades;
  /** The bright layer as a fill, laid pixel for pixel over the pad; made with the layer. */
  brightFill: CanvasPattern | null;
  /** The dry tank's boost band, at rest and held. */
  hatch: Record<'rest' | 'held', CanvasPattern>;
  /** Each label's width, for keeping one beside the ring inside the canvas. */
  labelW: Record<Held, number>;
}

export function createThumbGauge(): ThumbGauge {
  const el = document.createElement('canvas');
  el.className = 'ot-gauge';
  el.setAttribute('aria-hidden', 'true');
  const ctx = context(el);
  /** The resting points and the arrows. */
  const base = document.createElement('canvas');
  /** Every point at its brightest, shown in the wake round the finger and across the held zone. */
  const bright = document.createElement('canvas');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const boost = token('--cyan');
  const brake = token('--red');
  const sand = token('--sand');
  const ink = token('--ink');
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim();
  if (!font) throw new Error('thumbGauge: font token --font is missing (tokens.css)');
  const colourOf = (s: ThrottleState) => (s === 'boost' ? boost : s === 'brake' ? brake : sand);

  let lay: Layout | null = null;
  let tankEmpty = false;

  function bandOf(s: Held, l: Layout): Box {
    const { halfW, halfH } = l.pad;
    return s === 'boost' ? { left: -halfW, top: -halfH, right: halfW, bottom: -l.enter } : { left: -halfW, top: l.enter, right: halfW, bottom: halfH };
  }
  /** A layer the pad's size, its context set to the pad's centre coordinates. */
  function layer(c: HTMLCanvasElement, l: Layout): CanvasRenderingContext2D {
    c.width = Math.ceil(2 * l.pad.halfW * l.dpr);
    c.height = Math.ceil(2 * l.pad.halfH * l.dpr);
    const lc = context(c);
    lc.setTransform(l.dpr, 0, 0, l.dpr, l.pad.halfW * l.dpr, l.pad.halfH * l.dpr);
    return lc;
  }
  function lattice(c: CanvasRenderingContext2D, l: Layout, r: number, alpha: number): void {
    const step = LATTICE_MM * l.pad.mm;
    // Points stand symmetric about the centre, so neutral is a row of them.
    const nx = Math.floor(l.pad.halfW / step);
    const ny = Math.floor(l.pad.halfH / step);
    for (const zone of ['boost', 'drive', 'brake'] as const) {
      c.beginPath();
      for (let j = -ny; j <= ny; j++) {
        const y = j * step;
        if ((y < -l.enter ? 'boost' : y > l.enter ? 'brake' : 'drive') !== zone) continue;
        for (let i = -nx; i <= nx; i++) {
          c.moveTo(i * step + r, y);
          c.arc(i * step, y, r, 0, 2 * Math.PI);
        }
      }
      // A dry tank's boost points go hollow, as its band does.
      if (zone === 'boost' && tankEmpty) {
        c.strokeStyle = rgba(colourOf(zone), alpha);
        c.lineWidth = 1;
        c.stroke();
      } else {
        c.fillStyle = rgba(colourOf(zone), alpha);
        c.fill();
      }
    }
  }
  function drawLayers(l: Layout): void {
    const b = layer(base, l);
    lattice(b, l, DOT_FAR_PX, DOT_REST_ALPHA);
    // Arrows in each band at both ends of the steering travel, pointing the way to go.
    b.lineWidth = 1;
    for (const s of ['boost', 'brake'] as const) {
      const k = s === 'boost' ? -1 : 1;
      const mid = (k * (l.enter + l.reach)) / 2;
      b.strokeStyle = rgba(colourOf(s), CHEVRON_ALPHA);
      b.beginPath();
      for (const x of [-l.pad.steer, l.pad.steer]) {
        b.moveTo(x - CHEVRON_PX, mid - (k * CHEVRON_PX) / 2);
        b.lineTo(x, mid + (k * CHEVRON_PX) / 2);
        b.lineTo(x + CHEVRON_PX, mid - (k * CHEVRON_PX) / 2);
      }
      b.stroke();
    }
    lattice(layer(bright, l), l, l.swell ? DOT_NEAR_PX : DOT_FAR_PX, DOT_NEAR_ALPHA);
    // A pattern holds the layer as it was when made, so it is made again with it.
    const fill = ctx.createPattern(bright, 'no-repeat');
    if (!fill) throw new Error('thumbGauge: no pattern of the bright layer');
    // Pattern space is the pad's centre coordinates at dpr: back to the layer's own pixels.
    fill.setTransform(new DOMMatrix([1 / l.dpr, 0, 0, 1 / l.dpr, -l.pad.halfW, -l.pad.halfH]));
    l.brightFill = fill;
  }
  function hatch(alpha: number): CanvasPattern {
    const tile = document.createElement('canvas');
    tile.width = tile.height = HATCH_PX;
    const tc = context(tile);
    tc.strokeStyle = rgba(boost, alpha);
    tc.beginPath();
    tc.moveTo(0, HATCH_PX);
    tc.lineTo(HATCH_PX, 0);
    tc.stroke();
    const p = ctx.createPattern(tile, 'repeat');
    if (!p) throw new Error('thumbGauge: no hatch pattern');
    return p;
  }

  /** The pad's outline round `box`, `out` px outside it. */
  function outline(l: Layout, box: Box, out: number): void {
    const w = box.right - box.left + 2 * out;
    const h = box.bottom - box.top + 2 * out;
    ctx.beginPath();
    ctx.roundRect(box.left - out, box.top - out, w, h, Math.max(0, Math.min(l.corner + out, w / 2, h / 2)));
  }

  return {
    el,
    size(pad, t) {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio);
      // With reduced motion the points only brighten by the finger; they do not swell.
      const swell = !reducedMotion.matches;
      const same = lay && lay.dpr === dpr && lay.swell === swell && lay.enter === t.enter && lay.reach === t.reach && lay.pad.halfW === pad.halfW && lay.pad.halfH === pad.halfH;
      if (same) return;
      const ringR = RING_MM * pad.mm;
      // Whole device pixels, so the layers land on the canvas pixel for pixel, unresampled.
      const bleedX = Math.ceil((ringR + RING_LINE_PX) * dpr) / dpr;
      const bleedY = Math.ceil((ringR + LABEL_GAP_PX + LABEL_PX + LABEL_OUTLINE_PX) * dpr) / dpr;
      const w = 2 * (pad.halfW + bleedX);
      const h = 2 * (pad.halfH + bleedY);
      el.width = Math.ceil(w * dpr);
      el.height = Math.ceil(h * dpr);
      // Shown at exactly its backing size, so the browser never resamples it.
      el.style.width = `${el.width / dpr}px`;
      el.style.height = `${el.height / dpr}px`;
      const wakeR = WAKE_MM * pad.mm;
      const fade = (col: Rgb, alpha: number, r1 = DISSOLVE_MM * pad.mm, floor = DISSOLVE_FLOOR) => {
        const g = ctx.createRadialGradient(0, 0, ringR, 0, 0, r1);
        g.addColorStop(0, rgba(col, alpha));
        g.addColorStop(1, rgba(col, alpha * floor));
        return g;
      };
      const fades: Fades = {
        tint: fade(ink, TINT_ALPHA),
        band: { boost: fade(boost, BAND_ALPHA), brake: fade(brake, BAND_ALPHA) },
        held: { boost: fade(boost, BAND_HELD_ALPHA), brake: fade(brake, BAND_HELD_ALPHA) },
        enter: { boost: fade(boost, ENTER_LINE_ALPHA), brake: fade(brake, ENTER_LINE_ALPHA) },
        rim: fade(sand, RIM_ALPHA),
        cross: fade(sand, CROSS_ALPHA),
        dash: fade(sand, RIM_ALPHA, wakeR, 0),
      };
      // Set once here, after the resize that resets them: parsing a font string costs more than
      // the rest of a frame's drawing.
      ctx.font = `900 ${LABEL_PX}px ${font}`;
      ctx.lineJoin = 'round';
      lay = {
        pad,
        enter: t.enter,
        reach: t.reach,
        dpr,
        swell,
        ringR,
        corner: CORNER_MM * pad.mm,
        wakeR,
        bleedX,
        bleedY,
        fades,
        brightFill: null,
        hatch: { rest: hatch(BAND_ALPHA), held: hatch(BAND_HELD_ALPHA) },
        labelW: { boost: ctx.measureText('BOOST').width, brake: ctx.measureText('BRAKE').width },
      };
      drawLayers(lay);
    },
    place(x, y) {
      const l = lay;
      if (!l) throw new Error('thumbGauge: place before size');
      // On whole backing pixels too, for the same reason.
      const snap = (v: number) => Math.round(v * l.dpr) / l.dpr;
      el.style.transform = `translate3d(${snap(x - l.pad.halfW - l.bleedX)}px, ${snap(y - l.pad.halfH - l.bleedY)}px, 0)`;
    },
    draw(v) {
      const l = lay;
      if (!l) throw new Error('thumbGauge: draw before size');
      const { halfW, halfH } = l.pad;
      const { box, dx, dy, state } = v;
      const f = l.fades;
      // The pad's centre, or the finger, as the origin. A fade is built about the origin, so a
      // path laid about the centre and then filled about the finger fades from the finger.
      const at = (x: number, y: number) => ctx.setTransform(l.dpr, 0, 0, l.dpr, (halfW + l.bleedX + x) * l.dpr, (halfH + l.bleedY + y) * l.dpr);
      const rect = (b: Box) => {
        ctx.beginPath();
        ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top);
      };
      const paint = (style: CanvasGradient, how: 'fill' | 'stroke') => {
        at(dx, dy);
        if (how === 'fill') {
          ctx.fillStyle = style;
          ctx.fill();
        } else {
          ctx.strokeStyle = style;
          ctx.stroke();
        }
        at(0, 0);
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      at(0, 0);
      ctx.save();
      outline(l, box, 0);
      ctx.clip();
      outline(l, box, 0);
      paint(f.tint, 'fill');
      for (const s of ['boost', 'brake'] as const) {
        rect(bandOf(s, l));
        if (s === 'boost' && tankEmpty) {
          ctx.fillStyle = l.hatch[state === s ? 'held' : 'rest'];
          ctx.fill();
        } else paint(state === s ? f.held[s] : f.band[s], 'fill');
      }
      ctx.lineWidth = 1;
      for (const s of ['boost', 'brake'] as const) {
        const y = s === 'boost' ? -l.enter : l.enter;
        ctx.beginPath();
        ctx.moveTo(box.left, y);
        ctx.lineTo(box.right, y);
        paint(f.enter[s], 'stroke');
      }
      // The points: the resting lattice and the held zone's, copied pixel for pixel, then the wake.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const lx = Math.round(l.bleedX * l.dpr);
      const ly = Math.round(l.bleedY * l.dpr);
      ctx.drawImage(base, lx, ly);
      if (state !== 'drive') {
        const band = bandOf(state, l);
        const y0 = Math.floor((band.top + halfH) * l.dpr);
        const h = Math.min(bright.height, Math.ceil((band.bottom + halfH) * l.dpr)) - y0;
        ctx.globalAlpha = DOT_HELD_ALPHA;
        ctx.drawImage(bright, 0, y0, bright.width, h, lx, ly + y0, bright.width, h);
        ctx.globalAlpha = 1;
      }
      at(0, 0);
      if (!l.brightFill) throw new Error('thumbGauge: the bright layer was never drawn');
      ctx.fillStyle = l.brightFill;
      ctx.globalAlpha = WAKE_STEP_ALPHA;
      for (let k = WAKE_STEPS; k >= 1; k--) {
        ctx.beginPath();
        ctx.arc(dx, dy, (l.wakeR * k) / WAKE_STEPS, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.left, dy);
      ctx.lineTo(box.right, dy);
      ctx.moveTo(dx, box.top);
      ctx.lineTo(dx, box.bottom);
      paint(f.cross, 'stroke');
      ctx.restore();

      // Inset half its width, the rim lies wholly on the glass.
      outline(l, box, -0.5);
      paint(f.rim, 'stroke');
      outline(l, box, DASH_OUTSET_PX);
      ctx.setLineDash(DASH_PX);
      paint(f.dash, 'stroke');
      ctx.setLineDash([]);

      const col = colourOf(state);
      ctx.beginPath();
      ctx.arc(dx, dy, l.ringR, 0, 2 * Math.PI);
      ctx.fillStyle = rgba(col, RING_FILL_ALPHA);
      ctx.fill();
      ctx.lineWidth = RING_LINE_PX;
      ctx.strokeStyle = rgba(col, 1);
      ctx.stroke();
      if (state === 'drive') return;
      // Above the ring, where the thumb does not cover; with no room there, beside it, on the side
      // the hand is not, kept inside the canvas.
      const ox = halfW + l.bleedX;
      const lift = l.ringR + LABEL_GAP_PX;
      let x = dx;
      let y = dy - lift;
      ctx.textAlign = 'center';
      if (v.roomAbove < lift + LABEL_PX) {
        ctx.textAlign = v.away < 0 ? 'right' : 'left';
        x = v.away < 0 ? Math.max(-ox + l.labelW[state], dx - lift) : Math.min(ox - l.labelW[state], dx + lift);
        y = dy + LABEL_PX / 2;
      }
      ctx.lineWidth = LABEL_OUTLINE_PX;
      ctx.strokeStyle = rgba(ink, LABEL_OUTLINE_ALPHA);
      ctx.strokeText(state.toUpperCase(), x, y);
      ctx.fillStyle = rgba(col, 1);
      ctx.fillText(state.toUpperCase(), x, y);
    },
    showTankEmpty(empty) {
      if (empty === tankEmpty) return false;
      tankEmpty = empty;
      if (lay) drawLayers(lay);
      return true;
    },
  };
}
