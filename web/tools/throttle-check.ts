// Headless checks of the throttle swipe's state machine (src/ui/throttleSwipe.ts): the anchor
// lands under the finger, each state enters past its threshold and holds through the hysteresis
// band, an overshooting finger drags the anchor, lifting drives, and the thresholds scale with
// the screen.
//   node --experimental-strip-types tools/throttle-check.ts

import {
  DESK_PX_PER_MM,
  SWIPE_ENTER_MM,
  SWIPE_EXIT_MM,
  SWIPE_MAX_REACH_SHARE,
  SWIPE_REACH_MM,
  TOUCH_PX_PER_MM,
  ThrottleSwipe,
  swipeThresholds,
  type ThrottleState,
} from '../src/ui/throttleSwipe.ts';

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

const t = swipeThresholds(TOUCH_PX_PER_MM, PHONE_LANDSCAPE_H);
check(Math.abs(t.enter - SWIPE_ENTER_MM * TOUCH_PX_PER_MM) < EPS, `phone enter ${t.enter} px is ${SWIPE_ENTER_MM} mm`);
check(Math.abs(t.exit - SWIPE_EXIT_MM * TOUCH_PX_PER_MM) < EPS, `phone exit ${t.exit} px is ${SWIPE_EXIT_MM} mm`);
check(Math.abs(t.reach - SWIPE_REACH_MM * TOUCH_PX_PER_MM) < EPS, `phone reach ${t.reach} px is ${SWIPE_REACH_MM} mm`);
const squat = swipeThresholds(DESK_PX_PER_MM, SQUAT_H);
check(Math.abs(squat.reach - SWIPE_MAX_REACH_SHARE * SQUAT_H) < EPS, `squat window reach ${squat.reach} px capped to ${SWIPE_MAX_REACH_SHARE} of its height`);
check(Math.abs(squat.enter / squat.reach - SWIPE_ENTER_MM / SWIPE_REACH_MM) < EPS, 'squat window keeps the proportions');
let threw = false;
try {
  swipeThresholds(0, PHONE_LANDSCAPE_H);
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
if (failures > 0) {
  console.error(`${failures} throttle check(s) failed`);
  process.exit(1);
}
console.log('throttle checks passed');
