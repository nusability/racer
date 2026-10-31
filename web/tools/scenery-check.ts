// Builds every track's scene headless (no browser, no WebGL: tools/headless-canvas.ts) at both
// detail levels and runs the scenery audits on it: the clearance audit (no scenery in any
// ribbon's drivable envelope: src/render/track/clearance.ts), as built and again as the
// landmarks animate through a race's first minute, and the ground audit (no terrain rising into
// the road or run-off). Prints one line per track and every finding; exit code 1 when there is
// any.
//   npm run scenery                  every track and dev track, low and high
//   npm run scenery -- sunpan,oasis  only these
//   npm run scenery -- --high        one detail level only (--low / --high)
import './headless-canvas.ts';
import { TRACKS, trackById } from '../src/data/tracks/index.ts';
import { DEV_TRACKS, loadDevTrack } from '../src/ui/devTracks.ts';
import { Track } from '../src/core/track.ts';
import { buildTrackScene } from '../src/render/trackScene.ts';
import { describeFinding, type ClearanceFinding } from '../src/render/track/clearance.ts';
import { GROUND_RISE_MAX, type Quality } from '../src/render/track/config.ts';
import type { TrackDef } from '../src/core/types.ts';

declare const process: { argv: string[]; exit(code: number): never };

/**
 * The landmarks are posed every this many seconds of race time up to SWEEP_END: a step that
 * divides none of the hazards' periods (9 to 18 s), so the poses fall all through each cycle.
 */
const SWEEP_STEP = 1.7;
const SWEEP_END = 60;
/** Sweep hits on one object closer than this along the course are one spot, metres. */
const SWEEP_SPOT = 60;

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const qualities: Quality[] = args.includes('--low') ? ['low'] : args.includes('--high') ? ['high'] : ['low', 'high'];
for (const d of DEV_TRACKS) loadDevTrack(d.id);
const defs: TrackDef[] = [...TRACKS, ...DEV_TRACKS.map((d) => trackById(d.id))].filter((d) => !only || only.includes(d.id));
if (only && defs.length !== only.length) throw new Error(`scenery-check: no track ${only.filter((id) => !defs.some((d) => d.id === id)).join(', ')}`);

let total = 0;
for (const def of defs) {
  const track = new Track(def);
  const counts: string[] = [];
  const lines: string[] = [];
  for (const q of qualities) {
    const scene = buildTrackScene(track, q, null);
    const ground = scene.auditGround(GROUND_RISE_MAX);
    for (const f of scene.clearance) lines.push(`    [${q}] ${describeFinding(track, f)}`);
    // The same object at the same spot at several moments is one finding, at the first.
    const moving: (ClearanceFinding & { time: number })[] = [];
    for (let t = SWEEP_STEP; t <= SWEEP_END; t += SWEEP_STEP) {
      for (const f of scene.clearanceAt(t)) {
        if (moving.some((m) => m.what === f.what && m.branch === f.branch && Math.abs(track.ribbon(f.branch).delta(m.s0, f.s0)) < SWEEP_SPOT)) continue;
        if (scene.clearance.some((m) => m.what === f.what && m.branch === f.branch && Math.abs(track.ribbon(f.branch).delta(m.s0, f.s0)) < SWEEP_SPOT)) continue;
        moving.push({ ...f, time: t });
      }
    }
    for (const f of moving) lines.push(`    [${q} at ${f.time.toFixed(1)} s] ${describeFinding(track, f)}`);
    counts.push(`${q} ${scene.clearance.length} clearance, ${moving.length} moving, ${ground.length} ground`);
    if (ground.length > 0) {
      const g = ground.reduce((a, b) => (b.rise > a.rise ? b : a));
      lines.push(`    [${q}] ground: ${ground.length} spots over ${GROUND_RISE_MAX} m above the drivable surface, highest +${g.rise.toFixed(1)} m on branch ${g.branch} at s=${g.s.toFixed(0)} x=${g.x}`);
    }
    total += scene.clearance.length + moving.length + ground.length;
    scene.dispose();
  }
  console.log(`${def.id.padEnd(14)} ${counts.join(' | ')}`);
  for (const l of lines) console.log(l);
}
console.log(total === 0 ? 'scenery-check: clean' : `scenery-check: ${total} findings`);
process.exit(total === 0 ? 0 : 1);
