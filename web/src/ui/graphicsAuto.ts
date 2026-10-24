// Runs the graphics benchmark for the menus: on its own at boot when auto has no current
// measurement (first launch, a new build, another GPU), and on demand from Settings and the
// debug menu. A race starting stops it; the race then runs at the level auto already had.
import type { Career } from '../game/career.ts';
import { benchmarkStale, graphicsLevel, withBenchmark } from '../game/graphics.ts';
import type { BenchmarkResult } from '../render/benchmark.ts';

export interface GraphicsDeps {
  /** The game canvas's GPU, as the browser names it. */
  gpu: string;
  /** The benchmark (render/benchmark.ts runBenchmark); rejects with the signal's reason when aborted. */
  benchmark(signal: AbortSignal): Promise<BenchmarkResult>;
}

export class GraphicsAuto {
  private running: { abort: AbortController; done: Promise<void> } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly career: Career,
    readonly deps: GraphicsDeps,
  ) {}

  get testing(): boolean {
    return this.running !== null;
  }

  /** Measures when auto needs it; returns at once (the measurement runs in the background). */
  ensure(): void {
    const s = this.career.save.settings;
    if (s.graphics === 'auto' && benchmarkStale(s, __BUILD__, this.deps.gpu)) void this.run();
  }

  /** Back to auto and measure again (Settings' Re-test, the debug menu). */
  retest(): Promise<void> {
    this.career.setSettings({ ...this.career.save.settings, graphics: 'auto' });
    return this.run();
  }

  /** A race is starting: it must not share the GPU or the main thread with a measurement. */
  cancel(): void {
    this.running?.abort.abort(new DOMException('a race is starting', 'AbortError'));
  }

  /** Called when a measurement starts or ends; returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private run(): Promise<void> {
    if (this.running) return this.running.done;
    const abort = new AbortController();
    const gpu = this.deps.gpu;
    const t0 = performance.now();
    const done = this.deps
      .benchmark(abort.signal)
      .then(
        ({ ms, lowerBound }) => {
          this.career.setSettings(withBenchmark(this.career.save.settings, ms, lowerBound, __BUILD__, gpu));
          const s = this.career.save.settings;
          const kept = s.graphics === 'auto' ? '' : `; ${s.graphics} chosen by hand stays`;
          console.info(`graphics: auto → ${graphicsLevel({ ...s, graphics: 'auto' })} (${lowerBound ? 'over ' : ''}${ms.toFixed(1)} ms/frame, ${gpu}; took ${Math.round(performance.now() - t0)} ms)${kept}`);
        },
        (err: unknown) => {
          if (!abort.signal.aborted) throw err;
          console.info(`graphics: benchmark stopped (${String(abort.signal.reason)}); it runs again at the next launch`);
        },
      )
      .finally(() => {
        this.running = null;
        this.notify();
      });
    this.running = { abort, done };
    this.notify();
    return done;
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
