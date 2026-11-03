// One-thumb controls, apart from the DOM so they run headless (tools/throttle-check.ts). One
// finger anywhere does both jobs: its sideways travel steers exactly as slide steering does, and
// its vertical travel drives the throttle swipe (throttleSwipe.ts). The two axes are kept apart
// so a sideways slide never boosts or brakes and a held boost or brake never stops the steering.
// Screen y grows down.
import { ThrottleSwipe, type SwipeMm, type SwipeThresholds, type ThrottleState } from './throttleSwipe.ts';

/** The throttle swipe's geometry when the same finger also steers. */
export const ONE_THUMB_SWIPE_MM: SwipeMm = {
  /**
   * 1 mm more than the pad's 5. The lateral discount below leaves under 3 mm of a 15 mm sideways
   * slide's worst modelled wobble (throttle-check), but a thumb that also steers moves faster and
   * farther than one resting on the pad, and the model is a model: 6 mm keeps that residue under
   * half the way to a state while a deliberate stroke still takes one short roll.
   */
  enter: 6,
  /** The pad's 2.5 mm hysteresis band below the enter, so a resting thumb never flickers. */
  exit: 3.5,
  /** The pad's reach: neutral trails a thumb more than 10 mm out, 6.5 mm back from drive. */
  reach: 10,
};

/**
 * Of each stretch of movement, the vertical part counts toward the throttle only beyond 0.7 of
 * the sideways part: dy' = sign(dy)·max(0, |dy| − 0.7·|dx|), so nothing flatter than 35° counts.
 * A steering thumb sweeps an arc about its joint (slope under 0.3 over a 15 mm slide for a
 * 50–70 mm thumb) and wobbles on top. At 0.5 a 4 mm wobble still carried a held brake, pressed
 * 1 mm past its enter, back out of it (throttle-check); 0.7 holds it with room to spare, while a
 * straight up or down stroke counts in full and a 60° one at 60%. Steering is never discounted.
 */
export const LATERAL_DISCOUNT = 0.7;
/**
 * The discount is taken over stretches this long (a sixth of the enter: 1 mm on a phone), not
 * per touch event. Per event, a slow slide's sensor noise (±0.5 px on 0.5 px steps) is rectified
 * into a drift of a millimetre; within a stretch it cancels, as net travel. The stretch still
 * counts live, so a vertical stroke loses nothing to it.
 */
export const DISCOUNT_SPAN_OF_ENTER = 1 / 6;

/** The vertical travel of a stretch (dx, dy) that counts toward the throttle. */
function discounted(dx: number, dy: number): number {
  return Math.sign(dy) * Math.max(0, Math.abs(dy) - LATERAL_DISCOUNT * Math.abs(dx));
}

/** A finger on the glass, as 't<identifier>' for a touch or 'p<pointerId>' for a mouse or pen. */
interface Finger {
  id: string;
  x: number;
  y: number;
}

export class OneThumb {
  /** Asked at every new neutral, so a rotation since the last one resizes the swipe. */
  private readonly thresholdsNow: () => SwipeThresholds;
  private swipe: ThrottleSwipe;
  /** Fingers down in touch-down order; the first one drives. */
  private readonly fingers: Finger[] = [];
  /** The throttle's own y, up to the stretch under way: the driver's discounted vertical travel. */
  private throttleY = 0;
  /** The stretch under way: the driver's travel since the last one closed. */
  private spanX = 0;
  private spanY = 0;
  private steerPx = 0;

  constructor(thresholdsNow: () => SwipeThresholds) {
    this.thresholdsNow = thresholdsNow;
    this.swipe = new ThrottleSwipe(thresholdsNow());
  }

  get state(): ThrottleState {
    return this.swipe.state;
  }
  get touching(): boolean {
    return this.fingers.length > 0;
  }
  /** The driving finger, or null with none down. */
  get driver(): Readonly<Finger> | null {
    return this.fingers[0] ?? null;
  }
  /** The throttle's offset from its anchor, px, positive down; within ±reach. */
  get offset(): number {
    return this.swipe.offset;
  }
  get thresholds(): SwipeThresholds {
    return this.swipe.thresholds;
  }

  /**
   * A finger lands. The first one drives and anchors a new neutral under itself; another one
   * waits, and takes over only when the fingers before it lift. An id already down is a finger
   * whose lift never arrived (a browser may reuse a touch id): it lifts first, then lands anew.
   */
  down(id: string, x: number, y: number): void {
    this.up(id);
    this.fingers.push({ id, x, y });
    if (this.fingers.length === 1) this.anchor(y);
  }

  move(id: string, x: number, y: number): ThrottleState {
    const i = this.fingers.findIndex((f) => f.id === id);
    if (i < 0) return this.swipe.state;
    const f = this.fingers[i];
    const dx = x - f.x;
    const dy = y - f.y;
    f.x = x;
    f.y = y;
    // A waiting finger only keeps its place, so a takeover starts from where it is.
    if (i > 0) return this.swipe.state;
    this.steerPx += dx;
    this.spanX += dx;
    this.spanY += dy;
    if (Math.hypot(this.spanX, this.spanY) >= DISCOUNT_SPAN_OF_ENTER * this.swipe.thresholds.enter) {
      this.throttleY += discounted(this.spanX, this.spanY);
      this.spanX = 0;
      this.spanY = 0;
    }
    return this.swipe.move(this.throttleY + discounted(this.spanX, this.spanY));
  }

  /**
   * A finger lifts. The driver's lift drives on and leaves the steering where it is, as slide
   * steering does; a finger still down takes over with a fresh neutral under itself and no jump.
   */
  up(id: string): ThrottleState {
    const i = this.fingers.findIndex((f) => f.id === id);
    if (i < 0) return this.swipe.state;
    this.fingers.splice(i, 1);
    if (i > 0) return this.swipe.state;
    this.swipe.lift();
    const next = this.fingers[0];
    if (next) this.anchor(next.y);
    return this.swipe.state;
  }

  /** Every finger gone at once (a cancelled touch, the page hidden): drive on. */
  release(): void {
    this.fingers.length = 0;
    this.swipe.lift();
  }

  /** Sideways px steered since the last call. */
  takeSteerPx(): number {
    const px = this.steerPx;
    this.steerPx = 0;
    return px;
  }

  private anchor(y: number): void {
    this.swipe = new ThrottleSwipe(this.thresholdsNow());
    this.throttleY = y;
    this.spanX = 0;
    this.spanY = 0;
    this.swipe.press(y);
  }
}
