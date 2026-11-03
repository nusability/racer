// Headless checks of the throttle swipe's state machine (src/ui/throttleSwipe.ts): the anchor
// lands under the finger, each state enters past its threshold and holds through the hysteresis
// band, an overshooting finger drags the anchor, lifting drives, and the thresholds scale with
// the screen. Then the one-thumb controls (src/ui/oneThumb.ts): a sideways slide with a thumb's
// wobble and arc never boosts or brakes (the worst residue is printed), a clear stroke up or down
// does, steering carries on through a held boost or brake, and a second finger waits its turn.
//   node --experimental-strip-types tools/throttle-check.ts

import {
  DESK_PX_PER_MM,
  PAD_SWIPE_MM,
  SWIPE_MAX_REACH_SHARE,
  TOUCH_PX_PER_MM,
  ThrottleSwipe,
  swipeThresholds,
  type ThrottleState,
} from '../src/ui/throttleSwipe.ts';
import { LATERAL_DISCOUNT, ONE_THUMB_SWIPE_MM, OneThumb } from '../src/ui/oneThumb.ts';
import { PAD_CLEARANCE_PX, PAD_MARGIN_MM, PAD_STEER_MM, fitPad, padSize, trail, type Box } from '../src/ui/thumbPad.ts';

declare const process: { exit(code: number): never };

/** An iPhone in landscape: tall enough that the thresholds are their full millimetres. */
const PHONE_LANDSCAPE_H = 390;
/** A squat desktop window, short enough to scale the thresholds down. */
const SQUAT_H = 150;
const EPS = 1e-9;

let failures = 0;
function check(cond: boolean, what: string): void {
  if (cond) return;
  failures++;
  console.error(`  FAIL ${what}`);
}
function expectState(got: ThrottleState, want: ThrottleState, what: string): void {
  check(got === want, `${what}: ${got}, want ${want}`);
}

const t = swipeThresholds(PAD_SWIPE_MM, TOUCH_PX_PER_MM, PHONE_LANDSCAPE_H);
check(Math.abs(t.enter - PAD_SWIPE_MM.enter * TOUCH_PX_PER_MM) < EPS, `phone enter ${t.enter} px is ${PAD_SWIPE_MM.enter} mm`);
check(Math.abs(t.exit - PAD_SWIPE_MM.exit * TOUCH_PX_PER_MM) < EPS, `phone exit ${t.exit} px is ${PAD_SWIPE_MM.exit} mm`);
check(Math.abs(t.reach - PAD_SWIPE_MM.reach * TOUCH_PX_PER_MM) < EPS, `phone reach ${t.reach} px is ${PAD_SWIPE_MM.reach} mm`);
const squat = swipeThresholds(PAD_SWIPE_MM, DESK_PX_PER_MM, SQUAT_H);
check(Math.abs(squat.reach - SWIPE_MAX_REACH_SHARE * SQUAT_H) < EPS, `squat window reach ${squat.reach} px capped to ${SWIPE_MAX_REACH_SHARE} of its height`);
check(Math.abs(squat.enter / squat.reach - PAD_SWIPE_MM.enter / PAD_SWIPE_MM.reach) < EPS, 'squat window keeps the proportions');
let threw = false;
try {
  swipeThresholds(PAD_SWIPE_MM, 0, PHONE_LANDSCAPE_H);
} catch {
  threw = true;
}
check(threw, 'a zero density fails loud');
threw = false;
try {
  new ThrottleSwipe({ enter: 10, exit: 12, reach: 20 });
} catch {
  threw = true;
}
check(threw, 'an exit wider than the enter fails loud');

const Y = 500;
const s = new ThrottleSwipe(t);
expectState(s.move(Y - 2 * t.enter), 'drive', 'moving before a touch-down');

// Anchoring: wherever the finger lands is neutral.
for (const y0 of [120, Y, 760]) {
  expectState(s.press(y0), 'drive', `touch-down at ${y0}`);
  check(s.anchor === y0 && s.offset === 0, `anchor at touch-down ${y0}`);
  expectState(s.move(y0 - t.enter * 0.9), 'drive', `just short of boost from ${y0}`);
  expectState(s.move(y0 - t.enter), 'boost', `boost threshold from ${y0}`);
  s.lift();
}

// Boost, its hysteresis band, back to drive, then brake and its band.
s.press(Y);
expectState(s.move(Y - t.enter - 1), 'boost', 'up past enter');
expectState(s.move(Y - (t.enter + t.exit) / 2), 'boost', 'down into the band holds boost');
expectState(s.move(Y - t.exit - 0.01), 'boost', 'just above exit holds boost');
expectState(s.move(Y - t.exit + 0.01), 'drive', 'below exit drives');
expectState(s.move(Y - (t.enter + t.exit) / 2), 'drive', 'back up into the band stays drive');
expectState(s.move(Y + t.enter), 'brake', 'down past enter brakes');
expectState(s.move(Y + t.exit + 0.01), 'brake', 'just below exit holds brake');
expectState(s.move(Y + t.exit - 0.01), 'drive', 'above exit drives');

// A jittery thumb resting on the boost line: the state settles once and never flickers.
s.press(Y);
const states = new Set<string>();
let changes = 0;
let last: ThrottleState = 'drive';
const jitter = (t.enter - t.exit) * 0.45;
for (let i = 0; i < 200; i++) {
  const st = s.move(Y - t.enter - jitter * Math.sin(i * 1.7) - jitter);
  if (st !== last) changes++;
  last = st;
  states.add(st);
}
check(changes === 1 && last === 'boost', `jitter on the boost line changed state ${changes} times, ends ${last}`);
for (let i = 0; i < 200; i++) {
  const st = s.move(Y - t.exit - jitter * (1 + Math.sin(i * 2.3)));
  if (st !== last) changes++;
  last = st;
}
check(changes === 1, `jitter just above the exit flickered (${changes} changes)`);

// Straight across: boost to brake in one slide skips nothing it shouldn't.
s.press(Y);
s.move(Y - t.enter - 1);
expectState(s.move(Y + t.enter + 1), 'brake', 'one slide from boost to brake');
expectState(s.move(Y - t.enter - 1), 'boost', 'one slide from brake to boost');

// Overshoot: the anchor trails the finger, so neutral is never far back.
s.press(Y);
s.move(Y - 4 * t.reach);
check(Math.abs(s.offset + t.reach) < EPS, `overshoot holds the finger at the reach (offset ${s.offset})`);
check(Math.abs(s.anchor - (Y - 3 * t.reach)) < EPS, `overshoot drags the anchor (${s.anchor})`);
expectState(s.state, 'boost', 'overshoot is still boost');
expectState(s.move(Y - 4 * t.reach + (t.reach - t.exit) + 0.01), 'drive', 'back to drive within reach - exit of the far point');
s.move(Y + 4 * t.reach);
check(Math.abs(s.offset - t.reach) < EPS, `downward overshoot holds the finger at the reach (offset ${s.offset})`);
expectState(s.state, 'brake', 'downward overshoot brakes');

// Lifting always drives, and a fresh touch-down starts neutral.
expectState(s.lift(), 'drive', 'lift from brake');
check(!s.touching, 'lift ends the touch');
expectState(s.move(Y - 4 * t.reach), 'drive', 'moves after a lift do nothing');
expectState(s.press(Y + 3 * t.reach), 'drive', 'a fresh touch-down drives');

console.log(`throttle swipe on a phone: enter ${t.enter.toFixed(1)} px, exit ${t.exit.toFixed(1)} px, reach ${t.reach.toFixed(1)} px`);

// --- One thumb ---------------------------------------------------------------------------------
const MM = TOUCH_PX_PER_MM;
const ot = swipeThresholds(ONE_THUMB_SWIPE_MM, MM, PHONE_LANDSCAPE_H);
check(Math.abs(ot.enter - ONE_THUMB_SWIPE_MM.enter * MM) < EPS, `one-thumb enter ${ot.enter} px is ${ONE_THUMB_SWIPE_MM.enter} mm`);
check(
  Math.abs(ONE_THUMB_SWIPE_MM.enter - ONE_THUMB_SWIPE_MM.exit - (PAD_SWIPE_MM.enter - PAD_SWIPE_MM.exit)) < EPS,
  'one thumb keeps the pad\'s hysteresis band',
);
const newThumb = () => new OneThumb(() => ot);

/** The slide the owner named: 15 mm sideways, with a thumb's typical 2–4 mm vertical wobble. */
const SLIDE_MM = 15;
const WOBBLES_MM = [2, 3, 4];
/** Thumb lengths (tip to the joint it pivots on): the sideways slide is an arc of this radius. */
const THUMB_RADII_MM = [50, 60, 70];
/** Px a finger travels between touch events: a slow crawl, a steady slide, a fast flick. */
const EVENT_STEPS_PX = [0.5, 1, 4];
/** Sensor noise per touch event, px either way. */
const TOUCH_NOISE_PX = 0.5;
/** Wobble shapes over the slide (u = 0..1 along it): a hump, an S, and sudden hooks at either end. */
const WOBBLE_SHAPES: Record<string, (u: number) => number> = {
  hump: (u) => Math.sin(Math.PI * u),
  s: (u) => Math.sin(2 * Math.PI * u),
  hookStart: (u) => Math.min(1, u / 0.2),
  hookEnd: (u) => Math.max(0, (u - 0.8) / 0.2),
  drift: (u) => u,
};

/** A seeded generator for the touch noise, so a failure replays. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

interface SlideCase {
  what: string;
  wobbleMm: number;
  /** Finger points after the touch-down point, px. */
  points: [number, number][];
}

/** Every 15 mm slide: each shape, wobble, thumb, direction, arc sense, event step, with noise. */
function wobblySlides(x0: number, y0: number): SlideCase[] {
  const out: SlideCase[] = [];
  let seed = 1;
  for (const [shape, f] of Object.entries(WOBBLE_SHAPES))
    for (const a of WOBBLES_MM)
      for (const r of THUMB_RADII_MM)
        for (const dir of [-1, 1])
          for (const wob of [-1, 1])
            for (const arc of [-1, 1])
              for (const step of EVENT_STEPS_PX) {
                const noise = lcg(seed++);
                const len = SLIDE_MM * MM;
                const points: [number, number][] = [];
                for (let d = step; d <= len + EPS; d += step) {
                  const mm = d / MM;
                  const arcMm = r - Math.sqrt(r * r - mm * mm);
                  const y = y0 + (arc * arcMm + wob * a * f(mm / SLIDE_MM)) * MM + noise() * TOUCH_NOISE_PX;
                  points.push([x0 + dir * d, y]);
                }
                out.push({ what: `${shape} ${a} mm, thumb ${r} mm, dir ${dir}, wobble ${wob}, arc ${arc}, ${step} px/event`, wobbleMm: a, points });
              }
  return out;
}

const X0 = 400;
let worstMm = 0;
let worstWhat = '';
let slides = 0;
const worstByWobble = new Map<number, number>();
for (const c of wobblySlides(X0, Y)) {
  const o = newThumb();
  o.down('a', X0, Y);
  let left: ThrottleState = 'drive';
  for (const [x, y] of c.points) {
    const st = o.move('a', x, y);
    if (st !== 'drive') left = st;
    worstByWobble.set(c.wobbleMm, Math.max(worstByWobble.get(c.wobbleMm) ?? 0, Math.abs(o.offset) / MM));
    if (Math.abs(o.offset) / MM > worstMm) {
      worstMm = Math.abs(o.offset) / MM;
      worstWhat = c.what;
    }
  }
  slides++;
  check(left === 'drive', `a sideways slide (${c.what}) went to ${left}`);
  const [xEnd] = c.points[c.points.length - 1];
  check(Math.abs(o.takeSteerPx() - (xEnd - X0)) < EPS, `a sideways slide (${c.what}) steered all its travel`);
}
// Inside the exit band: a slide neither enters a state nor lets go of one held 1 mm past its enter.
check(
  worstMm < ONE_THUMB_SWIPE_MM.enter + 1 - ONE_THUMB_SWIPE_MM.exit,
  `the worst sideways slide's throttle residue ${worstMm.toFixed(2)} mm would let go of a held state`,
);
console.log(
  `one thumb: enter ${ONE_THUMB_SWIPE_MM.enter} mm, lateral discount ${LATERAL_DISCOUNT}; ${slides} wobbly ${SLIDE_MM} mm slides, worst throttle residue ${worstMm.toFixed(2)} mm (${worstWhat}); by wobble ${[...worstByWobble].map(([a, w]) => `${a} mm: ${w.toFixed(2)}`).join(', ')}`,
);

/** A straight stroke from (x0, y0) by (dx, dy) mm, in 1 px events along it. */
function stroke(o: OneThumb, id: string, x0: number, y0: number, dxMm: number, dyMm: number): ThrottleState {
  const n = Math.ceil(Math.hypot(dxMm, dyMm) * MM);
  let st = o.state;
  for (let i = 1; i <= n; i++) st = o.move(id, x0 + (dxMm * MM * i) / n, y0 + (dyMm * MM * i) / n);
  return st;
}
/** A clear stroke: past the enter with a thumb's margin. */
const CLEAR_MM = ONE_THUMB_SWIPE_MM.enter + 1;
/** A steep diagonal: a little sideways on the way up still counts as up. */
const STEEP_SIDEWAYS_MM = 3;

for (const [dy, want] of [
  [-CLEAR_MM, 'boost'],
  [CLEAR_MM, 'brake'],
] as const) {
  const o = newThumb();
  o.down('a', X0, Y);
  expectState(stroke(o, 'a', X0, Y, 0, dy), want, `a straight ${CLEAR_MM} mm stroke`);
  o.up('a');
  o.down('a', X0, Y);
  expectState(stroke(o, 'a', X0, Y, STEEP_SIDEWAYS_MM, dy + Math.sign(dy) * LATERAL_DISCOUNT * STEEP_SIDEWAYS_MM), want, 'a steep diagonal stroke');
  check(Math.abs(o.takeSteerPx() - STEEP_SIDEWAYS_MM * MM) < EPS, 'a steep diagonal steers its sideways part');
}
{
  const o = newThumb();
  o.down('a', X0, Y);
  expectState(stroke(o, 'a', X0, Y, 0, ONE_THUMB_SWIPE_MM.enter - 0.5), 'drive', 'a stroke just short of the one-thumb enter');
}

// Steering carries on through a held brake or boost: the slides (wobble and all) start from the
// held state, and it holds while every px of the sideways travel steers.
for (const [dy, held] of [
  [CLEAR_MM, 'brake'],
  [-CLEAR_MM, 'boost'],
] as const) {
  let drops = 0;
  for (const c of wobblySlides(X0, Y + dy * MM)) {
    const o = newThumb();
    o.down('a', X0, Y);
    stroke(o, 'a', X0, Y, 0, dy);
    o.takeSteerPx();
    for (const [x, y] of c.points) if (o.move('a', x, y) !== held) drops++;
    const [xEnd] = c.points[c.points.length - 1];
    check(Math.abs(o.takeSteerPx() - (xEnd - X0)) < EPS, `steering while in ${held} (${c.what}) steered all its travel`);
  }
  check(drops === 0, `steering while in ${held} let go of it ${drops} times`);
}

// Lifting drives on and steers nothing; touching again anchors a new neutral.
{
  const o = newThumb();
  o.down('a', X0, Y);
  stroke(o, 'a', X0, Y, 0, CLEAR_MM);
  o.takeSteerPx();
  expectState(o.up('a'), 'drive', 'lifting from brake');
  check(!o.touching && o.takeSteerPx() === 0, 'a lift steers nothing');
  expectState(o.move('a', X0 + 50, Y - 50), 'drive', 'moves after a lift do nothing');
  check(o.takeSteerPx() === 0, 'moves after a lift steer nothing');
  o.down('b', X0 + 120, Y + 80);
  check(o.offset === 0 && o.state === 'drive', 'a new touch-down is neutral');
  expectState(stroke(o, 'b', X0 + 120, Y + 80, 0, -CLEAR_MM), 'boost', 'boost from a new neutral');
}

// A second finger waits: it neither steers nor throttles, and takes over cleanly when the first
// lifts, with a fresh neutral where it is and no steering jump.
{
  const o = newThumb();
  o.down('a', X0, Y);
  stroke(o, 'a', X0, Y, 0, -CLEAR_MM);
  o.takeSteerPx();
  const bx = 900;
  const by = 300;
  o.down('b', bx, by);
  expectState(o.state, 'boost', 'a second finger landing leaves the boost');
  stroke(o, 'b', bx, by, 20, 20);
  check(o.takeSteerPx() === 0, 'a waiting finger steers nothing');
  expectState(o.state, 'boost', 'a waiting finger throttles nothing');
  expectState(o.up('a'), 'drive', 'the driver lifting hands over in drive');
  check(o.driver?.id === 'b' && o.offset === 0, 'the second finger takes over at a fresh neutral');
  const bx2 = bx + 20 * MM;
  const by2 = by + 20 * MM;
  check(o.takeSteerPx() === 0, 'the takeover steers nothing by itself');
  stroke(o, 'b', bx2, by2, 5, 0);
  check(Math.abs(o.takeSteerPx() - 5 * MM) < EPS, 'the second finger steers from where it is');
  expectState(stroke(o, 'b', bx2 + 5 * MM, by2, 0, CLEAR_MM), 'brake', 'the second finger brakes');
  // A finger whose lift never arrived lands again: it starts over in drive, not stuck.
  o.down('b', bx, by);
  check(o.driver?.id === 'b' && o.state === 'drive' && o.offset === 0, 'a re-landing finger starts over');
  o.release();
  check(!o.touching && o.state === 'drive', 'release lets every finger go');
}

// --- The one-thumb gauge's pad (src/ui/thumbPad.ts) -------------------------------------------
{
  const p = padSize(ot);
  check(Math.abs(p.steer - PAD_STEER_MM * MM) < EPS, `the pad shows ${PAD_STEER_MM} mm of steering each way (${p.steer} px)`);
  check(Math.abs(p.halfH - ot.reach - PAD_MARGIN_MM * MM) < EPS && Math.abs(p.halfW - p.steer - PAD_MARGIN_MM * MM) < EPS, 'the pad is the travel plus its margin');
  const squat = padSize(swipeThresholds(ONE_THUMB_SWIPE_MM, DESK_PX_PER_MM, SQUAT_H));
  check(Math.abs(squat.halfW / squat.halfH - p.halfW / p.halfH) < EPS, 'a squat window shrinks the pad in proportion');
  check(trail(100, 120, 30) === 100 && trail(100, 140, 30) === 110 && trail(100, 50, 30) === 80, 'the pad trails a finger that steers past its travel');

  // An 844 x 390 landscape phone, the speed and bars at the bottom middle, the minimap top right.
  const screen = { left: 0, top: 0, right: 844, bottom: 390 };
  const bars = { left: 292, top: 290, right: 552, bottom: 380 };
  const map = { left: 710, top: 74, right: 830, bottom: 194 };
  const keep = ot.enter;
  const padAt = (x: number, y: number) => ({ left: x - p.halfW, top: y - p.halfH, right: x + p.halfW, bottom: y + p.halfH });
  const clearOf = (a: Box, o: Box) => a.right + PAD_CLEARANCE_PX <= o.left || o.right + PAD_CLEARANCE_PX <= a.left || a.bottom + PAD_CLEARANCE_PX <= o.top || o.bottom + PAD_CLEARANCE_PX <= a.top;
  const overlapOf = (a: Box, o: Box) => Math.max(0, Math.min(a.right, o.right) - Math.max(a.left, o.left)) * Math.max(0, Math.min(a.bottom, o.bottom) - Math.max(a.top, o.top));
  const inside = (a: Box, o: Box) => a.left >= o.left && a.top >= o.top && a.right <= o.right && a.bottom <= o.bottom;
  const onScreen = { left: PAD_CLEARANCE_PX, top: PAD_CLEARANCE_PX, right: screen.right - PAD_CLEARANCE_PX, bottom: screen.bottom - PAD_CLEARANCE_PX };
  // [x, y, what, whether the HUD can be cleared with neutral's keep whole]
  const spots: [number, number, string, boolean][] = [
    [420, 240, 'a thumb low in the middle, above the bars', true],
    [600, 300, 'a thumb low right, beside the bars', true],
    [690, 250, 'a thumb below the minimap', true],
    [640, 120, 'a thumb beside the minimap', true],
    [20, 370, 'a thumb in the bottom-left corner', true],
    [560, 250, 'a thumb just above the bars\' corner', false],
    [700, 215, 'a thumb by the minimap\'s corner', false],
  ];
  for (const [x, y, what, clearable] of spots) {
    const b = fitPad(padAt(x, y), screen, [bars, map], { x, y }, keep);
    check(inside(b, onScreen), `${what}: the pad stays on screen`);
    // Each edge stands at least `keep` out from neutral, unless the screen ends first.
    check(
      (b.top <= y - keep || b.top === onScreen.top) && (b.bottom >= y + keep || b.bottom === onScreen.bottom) && (b.left <= x - keep || b.left === onScreen.left) && (b.right >= x + keep || b.right === onScreen.right),
      `${what}: neutral shows (${JSON.stringify(b)})`,
    );
    if (clearable) check(clearOf(b, bars) && clearOf(b, map), `${what}: the pad keeps clear of the HUD (${JSON.stringify(b)})`);
    else {
      // Too near to clear: cut right back to neutral's keep, so far less of the HUD is covered.
      const whole = padAt(x, y);
      const covered = (a: Box) => overlapOf(a, bars) + overlapOf(a, map);
      check(covered(b) < covered(whole) / 2, `${what}: the pad is cut back off the HUD (${covered(b).toFixed(0)} of ${covered(whole).toFixed(0)} px² left)`);
    }
  }
  // Cut, not moved: a pad with room is the whole pad, and a cut pad keeps its far edges.
  const free = padAt(200, 150);
  check(JSON.stringify(fitPad(free, screen, [bars, map], { x: 200, y: 150 }, keep)) === JSON.stringify(free), 'a pad with room is drawn whole');
  const low = fitPad(padAt(420, 240), screen, [bars, map], { x: 420, y: 240 }, keep);
  check(low.top === 240 - p.halfH && low.bottom === bars.top - PAD_CLEARANCE_PX, 'a pad over the bars is cut at its bottom, its top where it was');
  // A centre on the box itself: nothing can clear it, and the pad is left as the screen allows.
  const on = fitPad(padAt(420, 330), screen, [bars], { x: 420, y: 330 }, keep);
  check(on.left === 420 - p.halfW && on.right === 420 + p.halfW, 'a pad whose neutral sits on the bars is not cut away');
  console.log(`one-thumb pad on a phone: ${(2 * p.halfW).toFixed(0)} x ${(2 * p.halfH).toFixed(0)} px`);
}
if (failures > 0) {
  console.error(`${failures} throttle check(s) failed`);
  process.exit(1);
}
console.log('throttle checks passed');
