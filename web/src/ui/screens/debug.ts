// The hidden debug menu (long-press the title logo, or tap the build label in Settings 7
// times): progress cheats through Career's debug methods, per-device debug flags, the build
// stamp, the level viewer, the graphics benchmark, the world-look switches, and the last race
// logs to copy or share.
import type { UpgradeId } from '../../core/types.ts';
import { racerById, RACERS } from '../../data/racers.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES } from '../../data/upgrades.ts';
import { clearTelemetry, loadTelemetry, telemetrySummary, telemetryToText } from '../../game/telemetry.ts';
import type { RaceTelemetry } from '../../game/telemetry.ts';
import { canShare, copyText, shareText } from '../clipboard.ts';
import { loadDebugFlags, saveDebugFlags } from '../debugFlags.ts';
import { button, confirmButton, formatTime, h, header, panel, segmented, stepper, toast } from '../kit.ts';
import type { LookFlags } from '../../render/look/look.ts';
import { graphicsLevel } from '../../game/graphics.ts';
import type { AppCtx, Screen } from './context.ts';

const CREDIT_GRANTS = [10_000, 100_000];

export function debugScreen(ctx: AppCtx): Screen {
  const career = ctx.career;
  const root = h('div', 'screen screen--debug');
  let upgradeRacer = career.save.selectedRacer;
  const note = toast();
  const say = (msg: string) => note.say(msg);

  function flagsPanel(): HTMLElement {
    const flags = loadDebugFlags(ctx.store);
    const onOff = (id: string, aria: string, value: boolean, set: (v: boolean) => void) =>
      segmented<'on' | 'off'>(id, aria, [{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }], value ? 'on' : 'off', (v) => set(v === 'on'));
    const row = (label: string, control: HTMLElement) => h('div', 'setting', h('span', 'setting__label', label), control);
    return panel(
      'BUILD & FLAGS',
      h('div', 'debug__build', __BUILD__),
      row('DEBUG MODE', onOff('debug_mode', 'Debug mode', flags.enabled, (v) => saveDebugFlags(ctx.store, { ...loadDebugFlags(ctx.store), enabled: v }))),
      row('PERF READOUT', onOff('debug_perf', 'Race performance readout', flags.perfOverlay, (v) => saveDebugFlags(ctx.store, { ...loadDebugFlags(ctx.store), perfOverlay: v }))),
    );
  }

  /**
   * Opens the level viewer in this tab: a home-screen web app on iOS would hand a new tab to
   * Safari, outside the app. It opens at this device's graphics level; its BACK returns here.
   */
  function toolsPanel(): HTMLElement {
    return panel(
      'TOOLS',
      h('p', 'note', 'Fly round every level, jump to its spots and fire its hazards.'),
      button({
        id: 'debug_levelviewer_button',
        label: 'LEVEL VIEWER',
        aria: 'Open the level viewer',
        variant: 'primary',
        onTap: () => location.assign(`./track-viewer.html?level=${graphicsLevel(career.save.settings)}`),
      }),
    );
  }

  /**
   * Dev builds only: race or fly round the synthetic and look-dev tracks (ui/devTracks.ts), which
   * no world lists. A race opens with a career of its own (main.ts), so it never pays into this save.
   */
  function devTracksPanel(): HTMLElement | null {
    if (!import.meta.env.DEV) return null;
    const rows = h('div', 'debug__list');
    void import('../devTracks.ts').then(({ DEV_TRACKS }) =>
      rows.replaceChildren(
        ...DEV_TRACKS.map((t) =>
          h(
            'div',
            'debug__row',
            button({ id: `debug_race_${t.id}_button`, label: `RACE ${t.name.toUpperCase()}`, aria: `Race the dev track ${t.name}`, variant: 'primary', onTap: () => location.assign(`./?devtrack=${t.id}`) }),
            button({ id: `debug_view_${t.id}_button`, label: 'VIEW', aria: `Open ${t.name} in the level viewer`, onTap: () => location.assign(`./track-viewer.html?track=${t.id}&level=${graphicsLevel(career.save.settings)}`) }),
          ),
        ),
      ),
    );
    return panel('DEV TRACKS', h('p', 'note', 'Dev builds only. Synthetic and look-dev tracks no world lists.'), rows);
  }

  /** Switches for each part of a world's look, so the owner can A/B its look and frame rate. */
  function lookPanel(): HTMLElement {
    const look = loadDebugFlags(ctx.store).look;
    const set = (patch: Partial<LookFlags>) => {
      const f = loadDebugFlags(ctx.store);
      saveDebugFlags(ctx.store, { ...f, look: { ...f.look, ...patch } });
    };
    const onOff = (key: Exclude<keyof LookFlags, 'aa'>, label: string, aria: string) =>
      h('div', 'setting', h('span', 'setting__label', label),
        segmented<'on' | 'off'>(`debug_look_${key}`, aria, [{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }], look[key] ? 'on' : 'off', (v) => set({ [key]: v === 'on' })));
    return panel(
      'WORLD LOOK',
      h('p', 'note', 'Every world. Applies from the next race; graphics LOW skips the post effects. LEVEL anti-aliases as the graphics level does.'),
      onOff('world', 'LOOK PASS', 'World look pass'),
      onOff('post', 'POST FX', 'Post-processing: tone map and grade'),
      onOff('bloom', 'BLOOM', 'Bloom'),
      h('div', 'setting', h('span', 'setting__label', 'ANTI-ALIAS'),
        segmented<LookFlags['aa']>('debug_look_aa', 'Anti-aliasing', [{ value: 'level', label: 'LEVEL' }, { value: 'fxaa', label: 'FXAA' }, { value: 'msaa', label: 'MSAA' }, { value: 'off', label: 'OFF' }], look.aa, (v) => set({ aa: v }))),
      onOff('blur', 'BOOST BLUR', 'Boost blur'),
      onOff('wet', 'WET ROAD', 'Wet road'),
      onOff('gliders', 'GLIDER SHINE', 'Reflective gliders'),
      onOff('ao', 'BAKED SHADOW', 'Baked ambient occlusion'),
      onOff('haze', 'HEAT HAZE', 'Desert heat shimmer'),
    );
  }

  /** The graphics benchmark's last result on this device, and a button to run it again. */
  function graphicsPanel(): HTMLElement {
    const s = career.save.settings;
    const b = s.benchmark;
    const testing = ctx.graphics.testing;
    const line = (label: string, value: string) => h('div', 'debug__stat', h('span', 'setting__label', label), h('span', 'debug__value', value));
    return panel(
      'GRAPHICS',
      line('SETTING', s.graphics === 'auto' ? `AUTO → ${graphicsLevel(s).toUpperCase()}` : `${s.graphics.toUpperCase()} (by hand)`),
      b ? line('BENCHMARK', `${b.lowerBound ? '> ' : ''}${b.ms.toFixed(1)} ms/frame → ${b.measured.toUpperCase()}${b.level !== b.measured ? `, stepped down to ${b.level.toUpperCase()}` : ''}`) : line('BENCHMARK', 'not run yet'),
      line('GPU', ctx.graphics.deps.gpu),
      b ? line('MEASURED ON', b.gpu === ctx.graphics.deps.gpu ? b.build : `${b.gpu} · ${b.build}`) : null,
      button({
        id: 'debug_benchmark_button',
        label: testing ? 'TESTING…' : 'RE-RUN BENCHMARK',
        aria: 'Run the graphics benchmark again (sets graphics to auto)',
        variant: 'primary',
        disabled: testing,
        onTap: () => void ctx.graphics.retest().then(() => say(`Graphics: auto → ${graphicsLevel(career.save.settings).toUpperCase()}`)),
      }),
    );
  }

  function progressPanel(): HTMLElement {
    return panel(
      'PROGRESS',
      h('div', 'debug__credits', `Credits: ${career.save.credits.toLocaleString('en-US')} cr`),
      h(
        'div',
        'debug__row',
        button({ id: 'debug_unlockall_button', label: 'UNLOCK ALL', aria: 'Unlock every world and cup', variant: 'primary', onTap: () => (career.debugUnlockAll(), say('Every world and cup is open'), render()) }),
        ...CREDIT_GRANTS.map((n) =>
          button({ id: `debug_credits${n / 1000}k_button`, label: `+${n / 1000}K`, aria: `Add ${n} credits`, onTap: () => (career.debugAddCredits(n), say(`+${n.toLocaleString('en-US')} cr`), render()) }),
        ),
      ),
      h(
        'div',
        'debug__row',
        confirmButton({ id: 'debug_reset_button', label: 'RESET PROGRESS', aria: 'Reset all progress (keeps settings)', variant: 'ghost', onTap: () => (career.debugResetProgress(), say('Progress reset'), render()) }),
        button({ id: 'debug_reload_button', label: 'RELOAD GAME', aria: 'Reload the game', variant: 'ghost', onTap: () => location.reload() }),
      ),
    );
  }

  function glidersPanel(): HTMLElement {
    const owned = RACERS.filter((r) => career.owns(r.id));
    if (!career.owns(upgradeRacer)) upgradeRacer = career.save.selectedRacer;
    const rows = RACERS.map((r) =>
      h(
        'div',
        'debug__glider',
        h('span', 'debug__name', r.name),
        career.owns(r.id)
          ? h('span', 'badge badge--cyan', 'OWNED')
          : button({ id: `debug_give_${r.id}_button`, label: 'GIVE', aria: `Give ${r.name}`, onTap: () => (career.debugGiveRacer(r.id), render()) }),
      ),
    );
    const picker = segmented(
      'debug_upgraderacer',
      'Glider to upgrade',
      owned.map((r) => ({ value: r.id, label: r.name.toUpperCase() })),
      upgradeRacer,
      (id) => {
        upgradeRacer = id;
        render();
      },
    );
    const levels = career.upgradeLevels(upgradeRacer);
    const steppers = UPGRADES.map((u) =>
      stepper({
        idPrefix: `debug_upgrade_${u.id}`,
        label: u.name.toUpperCase(),
        aria: `${racerById(upgradeRacer).name} ${u.name} level`,
        value: levels[u.id],
        min: 0,
        max: MAX_UPGRADE_LEVEL,
        step: 1,
        format: String,
        onChange: (v) => career.debugSetUpgrade(upgradeRacer, u.id as UpgradeId, v),
      }),
    );
    return panel(
      'GLIDERS',
      button({ id: 'debug_giveall_button', label: 'GIVE ALL GLIDERS', aria: 'Give every glider', onTap: () => (RACERS.forEach((r) => career.debugGiveRacer(r.id)), render()) }),
      h('div', 'debug__gliders', ...rows),
      h('p', 'note', 'Upgrade levels'),
      picker,
      h('div', 'debug__upgrades', ...steppers),
      button({
        id: 'debug_maxall_button',
        label: 'MAX ALL',
        aria: `Max every upgrade on ${racerById(upgradeRacer).name}`,
        variant: 'primary',
        onTap: () => {
          for (const u of UPGRADES) career.debugSetUpgrade(upgradeRacer, u.id, MAX_UPGRADE_LEVEL);
          render();
        },
      }),
    );
  }

  function logsPanel(): HTMLElement {
    const logs = loadTelemetry();
    const label = (t: RaceTelemetry) => {
      const s = telemetrySummary(t);
      return `${s.track} · ${s.dnf ? 'DNF' : `P${s.place}`} · ${formatTime(s.time)} · ${new Date(s.when).toLocaleString()}`;
    };
    const copy = async (text: string, what: string) => say((await copyText(text, root)) === 'copied' ? `${what} copied` : `${what} shown to copy`);
    const rows = logs.map((t, i) =>
      h(
        'div',
        'debug__log',
        h('span', 'debug__logname', label(t)),
        button({ id: `debug_copylog${i}_button`, label: 'COPY', aria: `Copy race log ${i + 1}`, onTap: () => void copy(telemetryToText(t), 'Race log') }),
        canShare() ? button({ id: `debug_sharelog${i}_button`, label: 'SHARE', aria: `Share race log ${i + 1}`, onTap: () => void shareText(`Mirage Racer race log ${label(t)}`, telemetryToText(t)) }) : null,
      ),
    );
    const all = () => `[${logs.map(telemetryToText).join(',\n')}]`;
    return panel(
      `RACE LOGS (${logs.length})`,
      logs.length ? h('div', 'debug__logs', ...rows) : h('p', 'note', 'No races recorded yet.'),
      h(
        'div',
        'debug__row',
        button({ id: 'debug_copyall_button', label: 'COPY ALL', aria: 'Copy every race log', variant: 'primary', disabled: !logs.length, onTap: () => void copy(all(), 'All race logs') }),
        canShare() ? button({ id: 'debug_shareall_button', label: 'SHARE ALL', aria: 'Share every race log', disabled: !logs.length, onTap: () => void shareText('Mirage Racer race logs', all()) }) : null,
        confirmButton({ id: 'debug_clearlogs_button', label: 'CLEAR', aria: 'Clear race logs', variant: 'ghost', disabled: !logs.length, onTap: () => (clearTelemetry(), render()) }),
      ),
    );
  }

  function render(): void {
    // Every action re-renders; keep the list where the player was.
    const scroll = root.querySelector('.debug__body')?.scrollTop ?? 0;
    root.replaceChildren(
      header('debug', 'DEBUG', career.save.credits, () => ctx.go({ screen: 'menu' })),
      h('div', 'debug__body list-scroll', flagsPanel(), toolsPanel(), devTracksPanel(), graphicsPanel(), lookPanel(), progressPanel(), glidersPanel(), logsPanel()),
      note.el,
    );
    root.querySelector('.debug__body')?.scrollTo(0, scroll);
  }

  render();
  return { el: root, backdrop: 'sunset', dispose: ctx.graphics.subscribe(render) };
}
