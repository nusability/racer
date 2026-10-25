import type { Ribbon, Track } from '../../../core/track.ts';
import type { TrackDef } from '../../../core/types.ts';
import { TRACKS } from '../../../data/tracks/index.ts';
import { WORLDS } from '../../../data/worlds.ts';
import { button, h, segmented } from '../../../ui/kit.ts';
import { GRAPHICS_LEVELS, type GraphicsLevel } from '../../graphicsTuning.ts';
import type { ViewMode } from './cameraRig.ts';
import { hazardState, trackHazards, trackSpots, type ViewerHazard } from './spots.ts';

// The level viewer's controls: the top bar (back to the game, level picker, play, panel
// toggle) and the collapsible panel with its four tabs. Built from the game's kit so it looks
// like part of the game; every target is at least the kit's tap size.

export interface ViewerState {
  branch: number;
  s: number;
  /** Camera speed along the ribbon, m/s. */
  speed: number;
  paused: boolean;
  lateral: number;
}

export interface RaceClock {
  /** Race time, s: the hazard schedules' clock. */
  time: number;
  paused: boolean;
  /** Race seconds per real second. */
  rate: number;
}

export interface DisplaySettings {
  level: GraphicsLevel;
  look: boolean;
  stats: boolean;
  map: boolean;
}

/** What the panel reads and drives; devViewer.ts implements it. */
export interface ViewerApi {
  readonly state: ViewerState;
  readonly clock: RaceClock;
  readonly display: DisplaySettings;
  track(): Track;
  ribbon(): Ribbon;
  view(): ViewMode;
  setView(v: ViewMode): void;
  loadTrack(id: string): void;
  setBranch(branch: number): void;
  /** Moves the camera to (branch, s) and stops it there. */
  goTo(branch: number, s: number): void;
  trigger(h: ViewerHazard): void;
  setLevel(level: GraphicsLevel): void;
  setLook(on: boolean): void;
  setStats(on: boolean): void;
  setMap(on: boolean): void;
  setUiHidden(hidden: boolean): void;
  setPanelOpen(open: boolean): void;
}

/** Top camera speed the slider reaches, m/s: past the game's top speed, so race pace is on it. */
const SPEED_MAX = 200;
/** The speed slider is squared, so most of its travel is the slow speeds you inspect at. */
const SPEED_CURVE = 2;
const SPEED_STEPS = 1000;
const KMH_PER_MS = 3.6;
/** Race-clock rates on offer: slow motion to watch an event, and double to wait less. */
const CLOCK_RATES = [0.1, 0.25, 0.5, 1, 2] as const;
/** The clock scrubber spans this many seconds: longer than every hazard's period. */
const CLOCK_SPAN = 60;
const CLOCK_STEP = 0.1;

const TABS = [
  { id: 'move', label: 'MOVE' },
  { id: 'spots', label: 'SPOTS' },
  { id: 'events', label: 'EVENTS' },
  { id: 'display', label: 'DISPLAY' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface Slider {
  el: HTMLElement;
  input: HTMLInputElement;
  /** The value as text, beside the label. */
  out: HTMLElement;
  /** Sets the value unless a finger is on it. */
  set(v: number): void;
  setRange(min: number, max: number): void;
}

function slider(id: string, label: string, aria: string, min: number, max: number, step: number, onInput: (v: number) => void): Slider {
  const input = h('input', 'vw-range');
  input.type = 'range';
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', aria);
  let held = false;
  const grab = () => (held = true);
  const drop = () => (held = false);
  for (const ev of ['pointerdown', 'touchstart'] as const) input.addEventListener(ev, grab, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'change'] as const) input.addEventListener(ev, drop);
  input.addEventListener('input', () => onInput(Number(input.value)));
  const out = h('span', 'vw-readout');
  out.id = `${id}_value`;
  const el = h('div', 'vw-slider', h('div', 'vw-slider__head', h('span', 'setting__label', label), out), input);
  return {
    el,
    input,
    out,
    set(v) {
      if (!held) input.value = String(v);
    },
    setRange(lo, hi) {
      input.min = String(lo);
      input.max = String(hi);
    },
  };
}

function onOff(id: string, aria: string, value: boolean, set: (v: boolean) => void): HTMLElement {
  return segmented<'on' | 'off'>(id, aria, [{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }], value ? 'on' : 'off', (v) => set(v === 'on'));
}

/** A kit button's label span, for buttons whose text follows state. */
function label(b: HTMLButtonElement): HTMLElement {
  const el = b.querySelector<HTMLElement>('.btn__label');
  if (!el) throw new Error(`level viewer: button ${b.id} has no label`);
  return el;
}

const row = (label: string, control: HTMLElement) => h('div', 'vw-row', h('span', 'setting__label', label), control);

export interface ViewerUi {
  /** Everything but the hidden-UI hotspot; hiding the UI hides this. */
  root: HTMLElement;
  panel: HTMLElement;
  /** A new track is built: picker, routes, spots, hazards and ranges follow it. */
  setTrack(): void;
  /** Live readouts (position, clock, hazard states), a few times a second. */
  tick(): void;
  setPanelOpen(open: boolean): void;
}

/** `devTracks`: synthetic and look-dev tracks a dev build lists after the worlds (none in production). */
export function buildUi(api: ViewerApi, stage: HTMLElement[], devTracks: TrackDef[]): ViewerUi {
  // --- Top bar.
  const back = h('a', 'btn btn--icon vw-back', '‹');
  back.href = './';
  back.id = 'viewer_back_button';
  back.setAttribute('aria-label', 'Back to the game');
  const picker = h('select', 'vw-picker');
  picker.id = 'viewer_track_field';
  picker.setAttribute('aria-label', 'Level');
  let n = 0;
  for (const w of WORLDS) {
    const group = h('optgroup');
    group.label = w.name;
    for (const id of w.trackIds) {
      const t = TRACKS.find((x) => x.id === id);
      if (!t) throw new Error(`level viewer: world ${w.id} lists unknown track ${id}`);
      group.append(new Option(`${++n}. ${t.name}`, t.id));
    }
    picker.append(group);
  }
  if (n !== TRACKS.length) throw new Error(`level viewer: worlds list ${n} tracks, the game has ${TRACKS.length}`);
  if (devTracks.length > 0) {
    const group = h('optgroup');
    group.label = 'Dev and look-dev';
    for (const t of devTracks) group.append(new Option(t.name, t.id));
    picker.append(group);
  }
  picker.addEventListener('change', () => api.loadTrack(picker.value));
  const play: HTMLButtonElement = button({ id: 'viewer_play_button', label: '❚❚', aria: 'Play or pause the camera', variant: 'icon', onTap: () => (api.state.paused = !api.state.paused) });
  const playLabel = label(play);
  let panelOpen = true;
  const toggle = button({ id: 'viewer_panel_button', label: '☰', aria: 'Show or hide the panel', variant: 'icon', onTap: () => api.setPanelOpen(!panelOpen) });
  const top = h('div', 'vw-top', back, picker, play, toggle);

  // --- MOVE.
  const views = h('div', 'vw-seg');
  const routes = h('div', 'vw-seg');
  const pos = slider('viewer_position', 'POSITION', 'Position along the lap, metres', 0, 1, 1, (v) => (api.state.s = api.ribbon().wrap(v)));
  const speed = slider('viewer_speed', 'SPEED', 'Camera speed', 0, SPEED_STEPS, 1, (v) => (api.state.speed = SPEED_MAX * (v / SPEED_STEPS) ** SPEED_CURVE));
  const lateral = slider('viewer_lateral', 'LATERAL', 'Lateral offset from the centre line, metres', -1, 1, 0.5, (v) => (api.state.lateral = v));
  const centre = button({ id: 'viewer_centre_button', label: 'CENTRE', aria: 'Back to the centre line', variant: 'ghost', onTap: () => (api.state.lateral = 0) });
  const renderViews = () =>
    views.replaceChildren(
      segmented<ViewMode>('viewer_view', 'Camera', [
        { value: 'fly', label: 'CHASE' },
        { value: 'orbit', label: 'ORBIT' },
        { value: 'top', label: 'TOP' },
        { value: 'free', label: 'FREE' },
      ], api.view(), (v) => api.setView(v)),
    );
  const move = h('div', 'vw-tab', row('CAMERA', views), row('ROUTE', routes), pos.el, speed.el, h('div', 'vw-inline', lateral.el, centre));

  // --- SPOTS.
  const spots = h('div', 'vw-list');
  const spotsTab = h('div', 'vw-tab', h('p', 'note', 'Tap a spot to jump there. The camera stops; press play to fly on.'), spots);

  // --- EVENTS.
  const clockOut = h('span', 'vw-readout vw-readout--big');
  clockOut.id = 'viewer_clock_value';
  const clockRun = button({ id: 'viewer_clock_button', label: 'PAUSE CLOCK', aria: 'Pause or run the race clock', variant: 'ghost', onTap: () => (api.clock.paused = !api.clock.paused) });
  const clockRunLabel = label(clockRun);
  const rates = segmented<string>('viewer_rate', 'Clock speed', CLOCK_RATES.map((r) => ({ value: String(r), label: `${r}×` })), String(api.clock.rate), (v) => (api.clock.rate = Number(v)));
  const clockScrub = slider('viewer_clock', 'SCRUB', 'Race clock within the minute', 0, CLOCK_SPAN, CLOCK_STEP, (v) => {
    api.clock.time = Math.floor(api.clock.time / CLOCK_SPAN) * CLOCK_SPAN + v;
  });
  const hazards = h('div', 'vw-list');
  const hazardRows: { h: ViewerHazard; state: HTMLElement }[] = [];
  const events = h(
    'div',
    'vw-tab',
    h('div', 'vw-inline', h('div', 'vw-clock', h('span', 'setting__label', 'RACE CLOCK'), clockOut), clockRun),
    row('CLOCK SPEED', rates),
    clockScrub.el,
    h('p', 'note', 'Landmarks and hazards run on the race clock. TRIGGER sets it to just before the hazard fires.'),
    hazards,
  );

  // --- DISPLAY.
  const display = h(
    'div',
    'vw-tab',
    row('GRAPHICS', segmented<GraphicsLevel>('viewer_level', 'Graphics level', GRAPHICS_LEVELS.map((l) => ({ value: l, label: l.toUpperCase() })), api.display.level, (v) => api.setLevel(v))),
    row('WORLD LOOK', onOff('viewer_look', 'World look pass', api.display.look, (v) => api.setLook(v))),
    row('STATS', onOff('viewer_stats', 'Stats overlay', api.display.stats, (v) => api.setStats(v))),
    row('MAP', onOff('viewer_map', 'Minimap', api.display.map, (v) => api.setMap(v))),
    button({ id: 'viewer_hideui_button', label: 'HIDE UI', aria: 'Hide every control for a clean screenshot', variant: 'primary', onTap: () => api.setUiHidden(true) }),
    h('p', 'note', 'Hidden UI: tap the top-right corner (or press H) to bring it back. Keys: space play, F/O/T/V views, arrows speed and lateral, WASD QE free fly.'),
  );

  // --- Tabs.
  const bodies: Record<TabId, HTMLElement> = { move, spots: spotsTab, events, display };
  const body = h('div', 'vw-body list-scroll');
  let tab: TabId = 'move';
  const tabs = segmented<TabId>('viewer_tab', 'Panel', TABS.map((t) => ({ value: t.id, label: t.label })), tab, (v) => {
    tab = v;
    body.replaceChildren(bodies[v]);
    body.scrollTop = 0;
  });
  tabs.classList.add('vw-tabs');
  body.append(bodies[tab]);
  const panel = h('aside', 'vw-panel', tabs, body);
  panel.id = 'viewer_panel';
  const root = h('div', 'vw-ui', ...stage, top, panel);

  function setTrack(): void {
    const t = api.track();
    picker.value = t.def.id;
    routes.replaceChildren(
      segmented<string>('viewer_route', 'Route', [{ value: '-1', label: 'MAIN LOOP' }, ...t.branches.map((b) => ({ value: String(b.index), label: b.def.name.toUpperCase() }))], String(api.state.branch), (v) => {
        api.setBranch(Number(v));
        setRibbon();
      }),
    );
    renderViews();
    spots.replaceChildren(
      ...trackSpots(t).map((sp, i) => {
        const b = button({ id: `viewer_spot${i}_button`, label: sp.label, sub: `${sp.tag} · ${sp.s.toFixed(0)} m`, aria: `Go to ${sp.label}`, variant: 'ghost', onTap: () => api.goTo(sp.branch, sp.s) });
        b.classList.add('vw-spot', `vw-spot--${sp.kind}`);
        return b;
      }),
    );
    hazardRows.length = 0;
    const list = trackHazards(t);
    hazards.replaceChildren(
      ...(list.length === 0
        ? [h('p', 'note', 'No course hazards on this level.')]
        : list.map((hz, i) => {
            const d = hz.hazard.def;
            const where = hz.branch < 0 ? 'main loop' : t.branches[hz.branch].def.name;
            const state = h('div', 'vw-hazard__state');
            hazardRows.push({ h: hz, state });
            return h(
              'div',
              'vw-hazard',
              h('div', 'vw-hazard__title', h('span', 'badge badge--cyan', d.type.toUpperCase()), ` ${hz.landmark ?? d.id}`),
              h('div', 'vw-hazard__sub', `${d.id} · ${where} · ${hz.s.toFixed(0)} m · every ${d.period} s`),
              state,
              h(
                'div',
                'vw-inline',
                button({ id: `viewer_trigger${i}_button`, label: 'TRIGGER', aria: `Trigger ${hz.landmark ?? d.id}`, variant: 'primary', onTap: () => api.trigger(hz) }),
                button({ id: `viewer_hazardgo${i}_button`, label: 'GO THERE', aria: `Go to ${hz.landmark ?? d.id}`, variant: 'ghost', onTap: () => api.goTo(hz.branch, hz.s) }),
              ),
            );
          })),
    );
    setRibbon();
  }

  let ribbonShown: Ribbon | null = null;
  /** Position and lateral ranges follow the ribbon the camera is on. */
  function setRibbon(): void {
    const r = api.ribbon();
    ribbonShown = r;
    pos.setRange(0, Math.floor(r.length));
    const edge = Math.ceil(Math.max(...r.samples.map((p) => Math.max(p.edgeL, p.edgeR))));
    lateral.setRange(-edge, edge);
    for (const b of routes.querySelectorAll('button')) {
      const on = b.id === `viewer_route_${api.state.branch}_button`;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
  }

  let viewShown = api.view();
  function tick(): void {
    const st = api.state;
    const r = api.ribbon();
    if (r !== ribbonShown) setRibbon();
    if (api.view() !== viewShown) {
      viewShown = api.view();
      renderViews();
    }
    playLabel.textContent = st.paused ? '▶' : '❚❚';
    pos.set(Math.round(st.s));
    pos.out.textContent = `${st.s.toFixed(0)} / ${r.length.toFixed(0)} m`;
    speed.set(Math.round(SPEED_STEPS * (st.speed / SPEED_MAX) ** (1 / SPEED_CURVE)));
    speed.out.textContent = `${(st.speed * KMH_PER_MS).toFixed(0)} km/h`;
    lateral.set(st.lateral);
    lateral.out.textContent = `${st.lateral.toFixed(1)} m`;
    const c = api.clock;
    clockOut.textContent = `${c.time.toFixed(1)} s${c.paused ? ' (paused)' : ''}`;
    clockRunLabel.textContent = c.paused ? 'RUN CLOCK' : 'PAUSE CLOCK';
    clockScrub.set(((c.time % CLOCK_SPAN) + CLOCK_SPAN) % CLOCK_SPAN);
    clockScrub.out.textContent = `${(((c.time % CLOCK_SPAN) + CLOCK_SPAN) % CLOCK_SPAN).toFixed(1)} s`;
    for (const hr of hazardRows) hr.state.textContent = hazardState(hr.h.hazard, c.time);
  }

  function setPanelOpen(open: boolean): void {
    panelOpen = open;
    panel.hidden = !open;
    toggle.classList.toggle('is-on', open);
  }

  return { root, panel, setTrack, tick, setPanelOpen };
}
