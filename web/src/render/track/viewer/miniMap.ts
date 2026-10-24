import type { Ribbon, Track } from '../../../core/track.ts';
import type { Vec3 } from '../../../core/types.ts';

// The level viewer's map: the lap drawn once per track (road, chasms, tunnels, walls,
// shortcuts, hazards), with the camera's spot drawn over it. Tapping it jumps there.

/** Canvas size in CSS px; the CSS may draw it smaller on a phone. */
const MAP_SIZE = 180;
/** Clear margin round the drawing, px. */
const PAD = 8;
/** Every this many samples is drawn: plenty for a 180 px map. */
const SAMPLE_STRIDE = 4;
const DOT = 2;
const MARKER_RADIUS = 4;
const HAZARD_RADIUS = 3;
const COLORS = { road: '#fff', gap: '#f33', tunnel: '#222', wall: '#c84', branch: '#e6c', hazard: '#ff7a1a', me: '#0f0' };

export interface MapHit {
  branch: number;
  s: number;
}

export class MiniMap {
  readonly el = document.createElement('canvas');
  private readonly base = document.createElement('canvas');
  private track: Track | null = null;
  private x0 = 0;
  private z0 = 0;
  private scale = 1;
  /** Centres the lap's shorter side in the square. */
  private ox = PAD;
  private oz = PAD;

  constructor(onPick: (hit: MapHit) => void) {
    const dpr = Math.min(2, window.devicePixelRatio);
    for (const c of [this.el, this.base]) c.width = c.height = Math.round(MAP_SIZE * dpr);
    this.el.className = 'vw-map';
    this.el.setAttribute('aria-label', 'Track map: tap to jump there');
    this.el.addEventListener('click', (e) => {
      const r = this.el.getBoundingClientRect();
      const hit = this.nearest(((e.clientX - r.left) / r.width) * MAP_SIZE, ((e.clientY - r.top) / r.height) * MAP_SIZE);
      if (hit) onPick(hit);
    });
  }

  private ctx(c: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable for the minimap');
    return ctx;
  }

  private px(p: Vec3): [number, number] {
    return [this.ox + (p.x - this.x0) * this.scale, this.oz + (p.z - this.z0) * this.scale];
  }

  setTrack(track: Track): void {
    this.track = track;
    const xs = track.samples.map((p) => p.pos.x);
    const zs = track.samples.map((p) => p.pos.z);
    for (const b of track.branches) for (const p of b.ribbon.samples) (xs.push(p.pos.x), zs.push(p.pos.z));
    this.x0 = Math.min(...xs);
    this.z0 = Math.min(...zs);
    const w = Math.max(...xs) - this.x0;
    const d = Math.max(...zs) - this.z0;
    this.scale = (MAP_SIZE - 2 * PAD) / Math.max(w, d);
    this.ox = (MAP_SIZE - w * this.scale) / 2;
    this.oz = (MAP_SIZE - d * this.scale) / 2;
    const ctx = this.ctx(this.base);
    ctx.setTransform(this.base.width / MAP_SIZE, 0, 0, this.base.width / MAP_SIZE, 0, 0);
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    for (let k = 0; k < track.samples.length; k += SAMPLE_STRIDE) {
      const p = track.samples[k];
      ctx.fillStyle = p.gap ? COLORS.gap : Number.isFinite(p.ceiling) ? COLORS.tunnel : p.wallHeight > 0 ? COLORS.wall : COLORS.road;
      ctx.fillRect(...this.px(p.pos), DOT, DOT);
    }
    ctx.fillStyle = COLORS.branch;
    for (const b of track.branches) {
      for (let k = 0; k < b.ribbon.samples.length; k += SAMPLE_STRIDE) ctx.fillRect(...this.px(b.ribbon.samples[k].pos), DOT, DOT);
    }
    ctx.fillStyle = COLORS.hazard;
    for (const r of [track, ...track.branches.map((b) => b.ribbon)]) {
      for (const h of r.hazards) {
        ctx.beginPath();
        ctx.arc(...this.px(r.toWorld(h.s0, 0, 0)), HAZARD_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Redraws the camera's spot over the lap. */
  draw(me: Vec3): void {
    const ctx = this.ctx(this.el);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.el.width / MAP_SIZE, 0, 0, this.el.width / MAP_SIZE, 0, 0);
    ctx.fillStyle = COLORS.me;
    ctx.beginPath();
    ctx.arc(...this.px(me), MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The sample nearest a map point, on any ribbon. */
  private nearest(mx: number, my: number): MapHit | null {
    const t = this.track;
    if (!t) return null;
    let best: MapHit | null = null;
    let bestD = Infinity;
    const ribbons: [number, Ribbon][] = [[-1, t], ...t.branches.map((b): [number, Ribbon] => [b.index, b.ribbon])];
    for (const [branch, r] of ribbons) {
      for (const p of r.samples) {
        const [x, y] = this.px(p.pos);
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { branch, s: p.s };
        }
      }
    }
    return best;
  }
}
