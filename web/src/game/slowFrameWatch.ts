// The in-race graphics safety net: notices a race whose frame rate stays too low for too long,
// so an automatic level can step down for the next race (game/graphics.ts steppedDown).
import { SAFETY_GRACE_SECONDS, SAFETY_MIN_FPS, SAFETY_SLOW_SECONDS, SAFETY_STALL_SECONDS, SAFETY_WINDOW_SECONDS } from '../render/graphicsTuning.ts';

export class SlowFrameWatch {
  /** Once true it stays true for the race. */
  sustainedSlow = false;
  private watched = 0;
  private windowTime = 0;
  private windowFrames = 0;
  private slowFor = 0;

  /** One displayed, unpaused frame of `dt` real seconds (the display's own frame time, unclipped). */
  frame(dt: number): void {
    if (this.sustainedSlow) return;
    if (dt > SAFETY_STALL_SECONDS) {
      this.windowTime = 0;
      this.windowFrames = 0;
      this.slowFor = 0;
      return;
    }
    this.watched += dt;
    if (this.watched < SAFETY_GRACE_SECONDS) return;
    this.windowTime += dt;
    this.windowFrames++;
    if (this.windowTime < SAFETY_WINDOW_SECONDS) return;
    const fps = this.windowFrames / this.windowTime;
    this.slowFor = fps < SAFETY_MIN_FPS ? this.slowFor + this.windowTime : 0;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (this.slowFor >= SAFETY_SLOW_SECONDS) this.sustainedSlow = true;
  }
}
