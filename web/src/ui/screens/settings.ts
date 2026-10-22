// Settings: steering, sensitivity, sound, quality. Every change saves immediately.
import type { Settings, SteeringMode } from '../../game/types.ts';
import { requestTiltPermission } from '../input.ts';
import { h, header, panel, segmented, stepper } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

export const MIN_SENSITIVITY = 0.5;
export const MAX_SENSITIVITY = 1.5;
const SENSITIVITY_STEP = 0.1;

const STEERING_HELP: Record<SteeringMode, string> = {
  drag: 'Slide a thumb anywhere on the left: the craft follows it, and stays put when you lift.',
  tilt: 'Tilt the phone like a wheel; the more you tilt, the faster you slide.',
  buttons: 'Left and right buttons, bottom-left.',
};

export function settingsScreen(ctx: AppCtx): Screen {
  const career = ctx.career;
  const s: Settings = { ...career.save.settings };
  const save = () => career.setSettings(s);
  const help = h('p', 'note');
  const showHelp = () => (help.textContent = STEERING_HELP[s.steering]);

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
      s.steering = v;
      save();
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
      s.sensitivity = v;
      save();
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
      s.sound = v === 'on';
      ctx.audio.setEnabled(s.sound);
      save();
    },
  );

  const quality = segmented<Settings['quality']>(
    'settings_quality',
    'Graphics quality',
    [
      { value: 'low', label: 'LOW' },
      { value: 'high', label: 'HIGH' },
    ],
    s.quality,
    (v) => {
      s.quality = v;
      save();
    },
  );

  const row = (label: string, control: HTMLElement) => h('div', 'setting', h('span', 'setting__label', label), control);
  const el = h(
    'div',
    'screen screen--settings',
    header('settings', 'SETTINGS', null, () => ctx.go({ screen: 'menu' })),
    h(
      'div',
      'settings__body list-scroll',
      panel('CONTROLS', row('STEERING', steering), help, sensitivity),
      panel('GAME', row('SOUND', sound), row('GRAPHICS', quality)),
    ),
  );
  return { el, backdrop: 'sunset' };
}
