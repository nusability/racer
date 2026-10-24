// Settings: steering, sensitivity, sound, graphics. Every change saves immediately.
import { graphicsLevel } from '../../game/graphics.ts';
import type { GraphicsChoice, Settings, SteeringMode } from '../../game/types.ts';
import { GRAPHICS_LEVELS } from '../../render/graphicsTuning.ts';
import { requestTiltPermission } from '../input.ts';
import { button, h, header, panel, segmented, stepper } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

export const MIN_SENSITIVITY = 0.5;
export const MAX_SENSITIVITY = 1.5;
const SENSITIVITY_STEP = 0.1;

const STEERING_HELP: Record<SteeringMode, string> = {
  drag: 'Slide a thumb anywhere on the left: the craft follows it, and stays put when you lift.',
  tilt: 'Tilt the phone like a wheel; the more you tilt, the faster you slide.',
  buttons: 'Left and right buttons, bottom-left.',
};

/** Taps on the build label that open the hidden debug menu. */
const DEBUG_TAPS = 7;
/** Taps further apart than this start the count again. */
const DEBUG_TAP_GAP_MS = 1500;

export function settingsScreen(ctx: AppCtx): Screen {
  function buildLabel(): HTMLElement {
    const b = h('button', 'settings__build', `Build ${__BUILD__}`);
    b.type = 'button';
    b.id = 'settings_build_button';
    b.setAttribute('aria-label', `Build ${__BUILD__}`);
    let taps = 0;
    let last = 0;
    b.addEventListener('click', () => {
      const now = performance.now();
      taps = now - last > DEBUG_TAP_GAP_MS ? 1 : taps + 1;
      last = now;
      if (taps >= DEBUG_TAPS) ctx.go({ screen: 'debug' });
    });
    return b;
  }

  const career = ctx.career;
  const s = career.save.settings;
  // Only the field that changed is written: the benchmark may record its result meanwhile.
  const save = (patch: Partial<Settings>) => career.setSettings({ ...career.save.settings, ...patch });
  const help = h('p', 'note');
  const showHelp = () => (help.textContent = STEERING_HELP[career.save.settings.steering]);

  const steering = segmented<SteeringMode>(
    'settings_steering',
    'Steering',
    [
      { value: 'drag', label: 'SLIDE', sub: 'drag the craft' },
      { value: 'tilt', label: 'TILT' },
      { value: 'buttons', label: 'BUTTONS' },
    ],
    s.steering,
    (v) => {
      save({ steering: v });
      showHelp();
      if (v !== 'tilt') return;
      // iOS only grants motion access from inside a user gesture, so ask right here.
      requestTiltPermission().then((granted) => {
        if (granted) return;
        help.textContent = 'Motion access was denied. Allow it in your browser settings, or pick another mode.';
      });
    },
  );
  showHelp();

  const sensitivity = stepper({
    idPrefix: 'settings_sensitivity',
    label: 'SENSITIVITY',
    aria: 'Steering sensitivity',
    value: s.sensitivity,
    min: MIN_SENSITIVITY,
    max: MAX_SENSITIVITY,
    step: SENSITIVITY_STEP,
    format: (v) => `${Math.round(v * 100)}%`,
    onChange: (v) => {
      save({ sensitivity: v });
    },
  });

  const sound = segmented<'on' | 'off'>(
    'settings_sound',
    'Sound',
    [
      { value: 'on', label: 'ON' },
      { value: 'off', label: 'OFF' },
    ],
    s.sound ? 'on' : 'off',
    (v) => {
      const sound = v === 'on';
      ctx.audio.setEnabled(sound);
      save({ sound });
    },
  );

  const graphics = h('div', 'settings__graphics');
  function showGraphics(): void {
    graphics.replaceChildren(graphicsControl(ctx));
  }
  showGraphics();
  const unsubscribe = ctx.graphics.subscribe(showGraphics);

  const row = (label: string, control: HTMLElement) => h('div', 'setting', h('span', 'setting__label', label), control);
  const el = h(
    'div',
    'screen screen--settings',
    header('settings', 'SETTINGS', null, () => ctx.go({ screen: 'menu' })),
    h(
      'div',
      'settings__body list-scroll',
      panel('CONTROLS', row('STEERING', steering), help, sensitivity),
      panel('GAME', row('SOUND', sound), graphics, buildLabel()),
    ),
  );
  return { el, backdrop: 'sunset', dispose: unsubscribe };
}

/**
 * AUTO · LOW · MEDIUM · HIGH · ULTRA, what auto measured, and Re-test. Rebuilt whenever a
 * measurement starts or ends, so it never shows a stale pick.
 */
function graphicsControl(ctx: AppCtx): HTMLElement {
  const career = ctx.career;
  const s = career.save.settings;
  const testing = ctx.graphics.testing;
  const auto = graphicsLevel({ ...s, graphics: 'auto' }).toUpperCase();
  const choice = segmented<GraphicsChoice>(
    'settings_graphics',
    'Graphics',
    [
      { value: 'auto', label: 'AUTO', sub: testing ? 'TESTING…' : s.benchmark ? auto : 'NOT TESTED' },
      ...GRAPHICS_LEVELS.map((l) => ({ value: l, label: l.toUpperCase() })),
    ],
    s.graphics,
    (v) => {
      career.setSettings({ ...career.save.settings, graphics: v });
      // Auto with no current measurement for this build and GPU measures now.
      if (v === 'auto') ctx.graphics.ensure();
      note.textContent = graphicsNote(ctx);
    },
  );
  const note = h('p', 'note', graphicsNote(ctx));
  const retest = button({
    id: 'settings_graphics_retest_button',
    label: testing ? 'TESTING…' : 'RE-TEST',
    aria: 'Test this device again and pick the graphics level automatically',
    variant: 'ghost',
    disabled: testing,
    onTap: () => void ctx.graphics.retest(),
  });
  return h('div', 'settings__graphics', h('span', 'setting__label', 'GRAPHICS'), choice, h('div', 'settings__graphicsnote', note, retest));
}

function graphicsNote(ctx: AppCtx): string {
  const s = ctx.career.save.settings;
  const b = s.benchmark;
  if (ctx.graphics.testing) return 'Measuring this device…';
  const measured = b ? `${b.measured.toUpperCase()} measured on this device (${b.lowerBound ? 'over ' : ''}${b.ms.toFixed(1)} ms a frame)` : 'This device has not been measured yet.';
  const lowered = b && b.level !== b.measured ? `; lowered to ${b.level.toUpperCase()} after a slow race` : '';
  const pick = s.graphics === 'auto' ? `Auto: ${measured}${lowered}.` : `Set by hand. Auto: ${measured}${lowered}.`;
  return `${pick} Applies from the next race.`;
}
