// The time trial's HUD over the race HUD. While a run is flown it stays small and in the
// top-left corner, text with no box, so it never covers the road ahead: the lap in progress,
// its live delta to the ghost (green ahead, red behind), each sector line's split, best and
// last lap, and after each lap a compact readout that fades. When the trial ends, a summary
// panel takes the screen: the best lap against the ghost, every lap, whether a ghost was saved,
// and (in debug mode only) the physics sliders the run was flown with.
import type { LapResult, TrialSummary } from '../game/timeTrial.ts';
import type { TrialPhysics } from '../game/ghostStore.ts';
import { TRIAL_LAP_READOUT_SHOWN, TRIAL_SPLIT_SHOWN } from '../game/trialTuning.ts';
import { button, formatTime, h } from './kit.ts';

const RESTART_KEYS = new Set(['KeyR']);
/** A delta this close to zero reads as level, neither ahead nor behind (half the shown precision). */
const LEVEL = 0.005;
/** On the race layer while the summary is up: the race HUD and the run's readouts step aside. */
const SUMMARY_LAYER = 'race-layer--summary';

export interface TrialHudView {
  /** 'LAP n' on a circuit, 'SPRINT' on a sprint. */
  stage: string;
  lapTime: number;
  delta: number | null;
  best: number | null;
  last: number | null;
}

/** Why the trial ended, for the summary's headline. */
export interface TrialEnd {
  title: string;
  sub: string | null;
  sprint: boolean;
}

export interface TrialHud {
  update(v: TrialHudView): void;
  split(sector: number, time: number, delta: number | null): void;
  /** A lap (or a sprint's run) closed: the compact readout, faded out after a few seconds. */
  lap(r: LapResult, sprint: boolean): void;
  /** The trial is over: the summary panel with RETRY, CHANGE TRACK and MENU. */
  summary(s: TrialSummary, end: TrialEnd): void;
  /** Clears every readout and the summary for a fresh start. */
  reset(): void;
  dispose(): void;
}

export interface TrialHudOpts {
  /** Debug mode: the summary also lists the physics sliders. */
  debug: boolean;
  retry(): void;
  /** Back to the track picker. */
  tracks(): void;
  menu(): void;
}

/** "+0.12" behind, "−0.12" ahead (a true minus sign, so the digits don't shift). */
function formatDelta(d: number, digits: number): string {
  const v = Math.abs(d).toFixed(digits);
  return Math.abs(d) < LEVEL ? `±${v}` : d < 0 ? `−${v}` : `+${v}`;
}

function deltaClass(d: number | null): string {
  return d === null || Math.abs(d) < LEVEL ? 'is-level' : d < 0 ? 'is-ahead' : 'is-behind';
}

function deltaSpan(cls: string, d: number | null, digits: number): HTMLElement {
  return h('span', `${cls} ${deltaClass(d)}`, d === null ? '' : formatDelta(d, digits));
}

export function createTrialHud(root: HTMLElement, opts: TrialHudOpts): TrialHud {
  const stageEl = h('span', 'trial__stage');
  const timeEl = h('span', 'trial__time');
  const deltaEl = h('span', 'trial__delta');
  const splitEl = h('span', 'trial__split');
  const bestEl = h('span', 'trial__line');
  const lastEl = h('span', 'trial__line');
  const lapOut = h('div', 'trial__lapout');
  const summaryEl = h('div', 'trial__summary');
  summaryEl.setAttribute('role', 'dialog');
  summaryEl.setAttribute('aria-label', 'Time trial summary');
  const restart = h('button', 'trial__restart');
  restart.type = 'button';
  restart.id = 'hud_restart_button';
  restart.setAttribute('aria-label', 'Restart the run');
  restart.textContent = '↻';
  restart.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.retry();
  });
  const onKey = (e: KeyboardEvent) => {
    if (!RESTART_KEYS.has(e.code)) return;
    e.preventDefault();
    opts.retry();
  };
  window.addEventListener('keydown', onKey);
  const el = h(
    'div',
    'race-ui trial',
    h('div', 'trial__tl', stageEl, timeEl, h('div', 'trial__row', deltaEl, splitEl), bestEl, lastEl, lapOut),
    summaryEl,
    restart,
  );
  root.append(el);

  let last = { stage: '', time: '', delta: '', deltaCls: '', best: '', lastLap: '' };
  let splitUntil = 0;
  let lapUntil = 0;

  const physicsRows = (physics: TrialPhysics, ghost: TrialPhysics | null) => {
    const keys = Object.keys(physics);
    if (!opts.debug || keys.length === 0) return null;
    return h(
      'div',
      'trial__physics',
      h('div', 'trial__phead', 'PHYSICS', ghost ? h('span', 'trial__note', ' · ≠ differs from the ghost') : null),
      ...keys.map((k) => {
        const differs = ghost !== null && ghost[k] !== physics[k];
        return h('div', `trial__prow${differs ? ' is-diff' : ''}`, h('span', null, k), h('span', null, `×${physics[k].toFixed(2)}${differs ? ` ≠ ×${ghost?.[k]?.toFixed(2) ?? '—'}` : ''}`));
      }),
    );
  };

  /** The best lap's (or the run's) sectors: its own time, the start ghost's, and the difference. */
  const sectorTable = (s: TrialSummary, sprint: boolean) => {
    const best = s.best;
    if (!best) return null;
    const ghost = s.ghost;
    const cell = (text: string, cls = 'trial__cell') => h('span', cls, text);
    return h(
      'div',
      `trial__stable${ghost ? '' : ' is-alone'}`,
      cell(''),
      cell(sprint ? 'RUN' : 'BEST', 'trial__cell trial__chead'),
      ghost ? cell('GHOST', 'trial__cell trial__chead') : null,
      ghost ? cell('', 'trial__cell trial__chead') : null,
      ...best.sectors.flatMap((t, i) => [
        cell(`S${i + 1}`, 'trial__cell trial__split-n'),
        cell(t.toFixed(2)),
        ghost ? cell(ghost.sectors[i].toFixed(2)) : null,
        ghost ? deltaSpan('trial__cell', s.sectorDeltas[i], 2) : null,
      ]),
    );
  };

  /** Every lap against the run's best. */
  const lapList = (s: TrialSummary) => {
    const best = s.best;
    if (!best || s.laps.length < 2) return null;
    return h(
      'div',
      'trial__laps',
      ...s.laps.map((r) =>
        h(
          'div',
          `trial__lrow${r === best ? ' is-best' : ''}`,
          h('span', 'trial__split-n', `LAP ${r.lap}`),
          h('span', null, formatTime(r.time)),
          r === best ? h('span', 'trial__tag', 'BEST') : deltaSpan('trial__ld', r.time - best.time, 3),
        ),
      ),
    );
  };

  /** Against the ghost the run started with: saved over it, short of it, or the first ever. */
  const ghostLine = (s: TrialSummary) => {
    if (!s.best) return h('div', 'trial__sghost is-level', 'NO LAP SET');
    if (s.ghostSaved) return h('div', 'trial__sghost is-ahead', s.delta === null ? 'FIRST GHOST SAVED' : `NEW GHOST SAVED · ${formatDelta(s.delta, 3)}`);
    return h('div', `trial__sghost ${deltaClass(s.delta)}`, s.delta === null ? '' : `${formatDelta(s.delta, 3)} TO THE GHOST`);
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
      lapOut.classList.toggle('is-on', now < lapUntil);
    },
    split(sector, time, delta) {
      splitEl.className = `trial__split ${deltaClass(delta)}`;
      splitEl.replaceChildren(h('span', 'trial__split-n', `S${sector} `), delta === null ? formatTime(time) : formatDelta(delta, 2));
      splitUntil = performance.now() + TRIAL_SPLIT_SHOWN * 1000;
    },
    lap(r, sprint) {
      const sectors = r.sectors.map((s, i) => {
        const d = r.sectorDeltas[i];
        return h('span', `trial__ls ${deltaClass(d)}`, h('span', 'trial__split-n', `S${i + 1} `), d === null ? s.toFixed(2) : formatDelta(d, 2));
      });
      lapOut.replaceChildren(
        h(
          'div',
          'trial__lhead',
          h('span', 'trial__split-n', sprint ? 'RUN' : `LAP ${r.lap}`),
          h('span', null, formatTime(r.time)),
          r.delta === null ? null : deltaSpan('trial__ld', r.delta, 3),
          r.newBest ? h('span', 'trial__tag', 'NEW BEST') : null,
        ),
        h('div', 'trial__lsectors', ...sectors),
      );
      lapUntil = performance.now() + TRIAL_LAP_READOUT_SHOWN * 1000;
    },
    summary(s, end) {
      const laps = lapList(s);
      const physics = physicsRows(s.physics, s.ghost?.physics ?? null);
      summaryEl.replaceChildren(
        h(
          'div',
          'trial__spanel',
          h('div', 'trial__stitle', end.title),
          end.sub ? h('div', 'trial__ssub', end.sub) : null,
          h(
            'div',
            'trial__sbody',
            h(
              'div',
              'trial__scol',
              h('div', 'trial__slabel', end.sprint ? 'RUN' : 'BEST LAP'),
              h('div', 'trial__stime', s.best ? formatTime(s.best.time) : '—'),
              ghostLine(s),
              sectorTable(s, end.sprint),
            ),
            laps || physics ? h('div', 'trial__scol', laps, physics) : null,
          ),
          h(
            'div',
            'trial__actions',
            button({ id: 'trial_retry_button', label: 'RETRY', aria: 'Retry the trial from the grid', variant: 'primary', onTap: opts.retry }),
            button({ id: 'trial_tracks_button', label: 'CHANGE TRACK', aria: 'Back to the track list', onTap: opts.tracks }),
            button({ id: 'trial_menu_button', label: 'MENU', aria: 'Back to the main menu', variant: 'ghost', onTap: opts.menu }),
          ),
        ),
      );
      summaryEl.classList.add('is-on');
      root.classList.add(SUMMARY_LAYER);
    },
    reset() {
      summaryEl.classList.remove('is-on');
      summaryEl.replaceChildren();
      root.classList.remove(SUMMARY_LAYER);
      splitUntil = 0;
      lapUntil = 0;
      splitEl.classList.remove('is-on');
      lapOut.classList.remove('is-on');
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      root.classList.remove(SUMMARY_LAYER);
      el.remove();
    },
  };
}
