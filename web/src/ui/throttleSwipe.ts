// The throttle swipe's state machine, apart from the DOM so it runs headless
// (tools/throttle-check.ts). One finger on the pad: its touch-down point is neutral, sliding up
// boosts, sliding down air-brakes, back to the middle or lifting drives. Screen y grows down.

export type ThrottleState = 'drive' | 'boost' | 'brake';

/** Distances from the anchor, in CSS px. */
export interface SwipeThresholds {
  /** Offset that enters boost (above the anchor) or brake (below). */
  enter: number;
  /** A held boost or brake lets go once the finger is back nearer the anchor than this. */
  exit: number;
  /** The farthest the finger sits from the anchor: past it the anchor is dragged along. */
  reach: number;
}

/**
 * Travel to enter boost or brake. Thumb jitter while holding still on glass is about 1–2 mm, so
 * 5 mm never fires by accident, and boost to brake is a 10 mm slide: one short thumb roll.
 */
export const SWIPE_ENTER_MM = 5;
/**
 * Leave boost or brake only 2.5 mm short of where it began: that gap is the hysteresis, wider
 * than a jittery thumb wobbles, so a finger resting on the line holds its state.
 */
export const SWIPE_EXIT_MM = 2.5;
/**
 * The anchor trails a finger that overshoots more than 10 mm, so however far the thumb went,
 * neutral is never more than 7.5 mm back and the opposite state 15 mm away.
 */
export const SWIPE_REACH_MM = 10;
/**
 * CSS px per mm on a touch screen. Browsers hide the physical pixel density, and
 * devicePixelRatio is already divided out of CSS px; iOS points and Android dp are both laid out
 * at about 160 per inch, and phone browsers map one CSS px to one of them.
 */
export const TOUCH_PX_PER_MM = 160 / 25.4;
/** CSS px per mm with a mouse: the CSS reference of 96 px per inch, true enough for a desktop. */
export const DESK_PX_PER_MM = 96 / 25.4;
/**
 * The whole gauge (twice the reach) fills at most 40% of the screen's height, so on a short
 * landscape window both ends stay reachable from a touch-down mid-screen. A phone never needs it
 * (10 mm reach is 63 px, under 20% of a 375 px landscape height); a squat window does.
 */
export const SWIPE_MAX_REACH_SHARE = 0.2;

/** The thresholds for a screen: millimetres at its density, scaled down together on a short one. */
export function swipeThresholds(pxPerMm: number, viewportHeight: number): SwipeThresholds {
  if (!(pxPerMm > 0) || !(viewportHeight > 0)) throw new Error(`swipeThresholds: bad screen ${pxPerMm} px/mm, ${viewportHeight} px high`);
  const reach = SWIPE_REACH_MM * pxPerMm;
  const scale = Math.min(1, (SWIPE_MAX_REACH_SHARE * viewportHeight) / reach);
  return { enter: SWIPE_ENTER_MM * pxPerMm * scale, exit: SWIPE_EXIT_MM * pxPerMm * scale, reach: reach * scale };
}

export class ThrottleSwipe {
  private current: ThrottleState = 'drive';
  private anchorY = 0;
  private fingerY = 0;
  private down = false;
  private readonly t: SwipeThresholds;

  constructor(t: SwipeThresholds) {
    this.t = t;
    if (!(t.exit > 0 && t.exit < t.enter && t.enter < t.reach)) throw new Error(`ThrottleSwipe: thresholds must be 0 < exit < enter < reach, got ${JSON.stringify(t)}`);
  }

  get state(): ThrottleState {
    return this.current;
  }
  get touching(): boolean {
    return this.down;
  }
  /** Where neutral is now (it moves only when the finger overshoots the reach). */
  get anchor(): number {
    return this.anchorY;
  }
  /** The finger's offset from the anchor, px, positive down; within ±reach. */
  get offset(): number {
    return this.fingerY - this.anchorY;
  }

  /** Touch-down anchors neutral under the finger, so there is no spot to find. */
  press(y: number): ThrottleState {
    this.down = true;
    this.anchorY = y;
    this.fingerY = y;
    this.current = 'drive';
    return this.current;
  }

  move(y: number): ThrottleState {
    if (!this.down) return this.current;
    this.fingerY = y;
    const { enter, exit, reach } = this.t;
    if (y - this.anchorY > reach) this.anchorY = y - reach;
    else if (this.anchorY - y > reach) this.anchorY = y + reach;
    const up = this.anchorY - y;
    const entered = up >= enter ? 'boost' : up <= -enter ? 'brake' : 'drive';
    if (this.current === 'boost' && up >= exit) return this.current;
    if (this.current === 'brake' && -up >= exit) return this.current;
    this.current = entered;
    return this.current;
  }

  /** Lifting the finger drives on. */
  lift(): ThrottleState {
    this.down = false;
    this.current = 'drive';
    return this.current;
  }
}
