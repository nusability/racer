// The time trial's HUD over the race HUD: the lap in progress, its live delta to the ghost
// (green ahead, red behind), best and last lap, each sector line's split, a quick restart, and
// the small results panel after each lap (or a sprint's run). The physics sliders a lap was
// flown with show only in debug mode: a player sees time, delta and splits.
import type { LapResult } from '../game/timeTrial.ts';
import type { TrialPhysics } from '../game/ghostStore.ts';
import { TRIAL_LAP_PANEL_SHOWN, TRIAL_SPLIT_SHOWN } from '../game/trialTuning.ts';
import { formatTime, h } from './kit.ts';

const RESTART_KEYS = new Set(['KeyR']);
/** A delta this close to zero reads as level, neither ahead nor behind (half the shown precision). */
const LEVEL = 0.005;

export interface TrialHudView {
  /** 'LAP n' on a circuit, 'SPRINT' on a sprint. */
  stage: string;
  lapTime: number;
  delta: number | null;
  best: number | null;
  last: number | null;
}

export interface TrialHud {
  update(v: TrialHudView): void;
  split(sector: number, time: number, delta: number | null): void;
  /** A lap's (or run's) results; `final` keeps the panel up with RESTART and EXIT. */
  lap(r: LapResult, final: boolean): void;
  /** The run ended without a time (a wreck): RESTART and EXIT. */
  over(title: string): void;
  /** Clears the panel and split for a fresh start. */
  reset(): void;
  dispose(): void;
}

export interface TrialHudOpts {
  /** Debug mode: the panel also lists the physics sliders. */
  debug: boolean;
  restart(): void;
  exit(): void;
}

/** "+0.12" behind, "−0.12" ahead (a true minus sign, so the digits don't shift). */
function formatDelta(d: number, digits: number): string {
  const v = Math.abs(d).toFixed(digits);
  return Math.abs(d) < LEVEL ? `±${v}` : d < 0 ? `−${v}` : `+${v}`;
}

function deltaClass(d: number | null): string {
  return d === null || Math.abs(d) < LEVEL ? 'is-level' : d < 0 ? 'is-ahead' : 'is-behind';
}

export function createTrialHud(root: HTMLElement, opts: TrialHudOpts): TrialHud {
  const stageEl = h('span', 'trial__stage');
  const timeEl = h('span', 'trial__time');
  const deltaEl = h('span', 'trial__delta');
  const bestEl = h('span', 'trial__line');
  const lastEl = h('span', 'trial__line');
  const splitEl = h('div', 'trial__split');
  const panel = h('div', 'trial__panel');
  const restart = h('button', 'trial__restart');
  restart.type = 'button';
  restart.id = 'hud_restart_button';
  restart.setAttribute('aria-label', 'Restart the run');
  restart.textContent = '↻';
  restart.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.restart();
  });
  const onKey = (e: KeyboardEvent) => {
    if (!RESTART_KEYS.has(e.code)) return;
    e.preventDefault();
    opts.restart();
  };
  window.addEventListener('keydown', onKey);
  const el = h('div', 'race-ui trial', h('div', 'trial__tl', stageEl, timeEl, deltaEl, bestEl, lastEl), splitEl, panel, restart);
  root.append(el);

  let last = { stage: '', time: '', delta: '', deltaCls: '', best: '', lastLap: '' };
  let splitUntil = 0;
  let panelUntil = 0;

  const physicsRows = (r: LapResult) => {
    const keys = Object.keys(r.physics);
    if (!opts.debug || keys.length === 0) return null;
    const ghost: TrialPhysics | null = r.ghostPhysics;
    return h(
      'div',
      'trial__physics',
      h('div', 'trial__phead', 'PHYSICS', ghost ? h('span', 'trial__note', ' · ≠ differs from the ghost') : null),
      ...keys.map((k) => {
        const differs = ghost !== null && ghost[k] !== r.physics[k];
        return h('div', `trial__prow${differs ? ' is-diff' : ''}`, h('span', null, k), h('span', null, `×${r.physics[k].toFixed(2)}${differs ? ` ≠ ×${ghost?.[k]?.toFixed(2) ?? '—'}` : ''}`));
      }),
    );
  };

  const actions = () => {
    const btn = (id: string, label: string, aria: string, fn: () => void, primary: boolean) => {
      const b = h('button', `btn btn--${primary ? 'primary' : 'secondary'}`, h('span', 'btn__label', label));
      b.type = 'button';
      b.id = id;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      return b;
    };
    return h('div', 'trial__actions', btn('trial_restart_button', 'RESTART', 'Restart the run', opts.restart, true), btn('trial_exit_button', 'EXIT', 'Back to the track list', opts.exit, false));
  };

  const showPanel = (children: (HTMLElement | null)[], final: boolean) => {
    panel.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
    if (final) panel.append(actions());
    panel.classList.add('is-on');
    panel.classList.toggle('is-final', final);
    panelUntil = final ? Infinity : performance.now() + TRIAL_LAP_PANEL_SHOWN * 1000;
  };

  return {
    update(v) {
      const set = (key: keyof typeof last, value: string, apply: () => void) => {
        if (last[key] === value) return;
        last = { ...last, [key]: value };
        apply();
      };
      set('stage', v.stage, () => (stageEl.textContent = v.stage));
      const t = formatTime(v.lapTime);
      set('time', t, () => (timeEl.textContent = t));
      const d = v.delta === null ? '' : formatDelta(v.delta, 2);
      set('delta', d, () => (deltaEl.textContent = d));
      const cls = `trial__delta ${deltaClass(v.delta)}`;
      set('deltaCls', cls, () => (deltaEl.className = cls));
      const b = v.best === null ? '' : `BEST ${formatTime(v.best)}`;
      set('best', b, () => (bestEl.textContent = b));
      const l = v.last === null ? '' : `LAST ${formatTime(v.last)}`;
      set('lastLap', l, () => (lastEl.textContent = l));
      const now = performance.now();
      splitEl.classList.toggle('is-on', now < splitUntil);
      if (now >= panelUntil) panel.classList.remove('is-on');
    },
    split(sector, time, delta) {
      splitEl.className = `trial__split ${deltaClass(delta)}`;
      splitEl.replaceChildren(h('span', 'trial__split-n', `S${sector}`), h('span', null, delta === null ? formatTime(time) : formatDelta(delta, 2)));
      splitUntil = performance.now() + TRIAL_SPLIT_SHOWN * 1000;
    },
    lap(r, final) {
      const head = r.newBest ? (r.best === null ? 'FIRST TIME' : 'NEW BEST') : r.delta !== null ? `${formatDelta(r.delta, 3)} TO BEST` : '';
      showPanel(
        [
          h('div', 'trial__ptitle', final ? 'RUN' : `LAP ${r.lap}`),
          h('div', 'trial__ptime', formatTime(r.time)),
          h('div', `trial__phead2 ${r.newBest ? 'is-ahead' : deltaClass(r.delta)}`, head, r.newBest && r.delta !== null ? ` ${formatDelta(r.delta, 3)}` : ''),
          h(
            'div',
            'trial__sectors',
            ...r.sectors.map((s, i) => {
              const d = r.sectorDeltas[i];
              return h('div', 'trial__sector', h('span', 'trial__split-n', `S${i + 1}`), h('span', null, s.toFixed(2)), h('span', `trial__sd ${deltaClass(d)}`, d === null ? '' : formatDelta(d, 2)));
            }),
          ),
          physicsRows(r),
        ],
        final,
      );
    },
    over(title) {
      showPanel([h('div', 'trial__ptitle', title)], true);
    },
    reset() {
      panel.classList.remove('is-on');
      panelUntil = 0;
      splitUntil = 0;
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
