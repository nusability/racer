// The small UI kit every screen builds from: element builder, buttons, panels, stat bars,
// level pips, segmented controls and the screen header. Screens never hand-roll these.

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children) if (c) el.append(c);
  return el;
}

export function formatCredits(n: number): string {
  return `${n.toLocaleString('en-US')} cr`;
}

export function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'boost' | 'icon';

export interface ButtonOpts {
  /** Stable test id: `<surface>_<action>_button`. */
  id: string;
  label: string;
  aria: string;
  variant?: ButtonVariant;
  /** Small second line (price, track name...). */
  sub?: string;
  disabled?: boolean;
  big?: boolean;
  onTap: () => void;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const b = h('button', `btn btn--${o.variant ?? 'secondary'}${o.big ? ' btn--big' : ''}`);
  b.type = 'button';
  b.id = o.id;
  b.setAttribute('aria-label', o.aria);
  b.append(h('span', 'btn__label', o.label));
  if (o.sub) b.append(h('span', 'btn__sub', o.sub));
  b.disabled = o.disabled ?? false;
  b.addEventListener('click', () => {
    if (!b.disabled) o.onTap();
  });
  return b;
}

export function panel(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', 'panel', title ? h('h3', 'panel__title', title) : null, ...children);
}

/** Bar of the stock value plus a hot segment for what upgrades add. */
export function statBar(label: string, base01: number, total01: number): HTMLElement {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const fill = h('div', 'stat__base');
  fill.style.width = `${clamp(base01) * 100}%`;
  const extra = h('div', 'stat__extra');
  extra.style.left = `${clamp(base01) * 100}%`;
  extra.style.width = `${Math.max(0, clamp(total01) - clamp(base01)) * 100}%`;
  const row = h('div', 'stat', h('span', 'stat__label', label), h('div', 'stat__track', fill, extra));
  row.setAttribute('role', 'meter');
  row.setAttribute('aria-label', label);
  row.setAttribute('aria-valuenow', String(Math.round(clamp(total01) * 100)));
  return row;
}

export function pips(level: number, max: number): HTMLElement {
  const el = h('div', 'pips');
  el.setAttribute('aria-label', `Level ${level} of ${max}`);
  for (let i = 0; i < max; i++) el.append(h('span', i < level ? 'pip pip--on' : 'pip'));
  return el;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A row of mutually exclusive buttons; ids are `<surface>_<field>_<value>_button`. */
export function segmented<T extends string>(
  idPrefix: string,
  aria: string,
  options: SegmentOption<T>[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const group = h('div', 'seg');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', aria);
  const buttons = options.map((opt) => {
    const b = button({
      id: `${idPrefix}_${opt.value}_button`,
      label: opt.label,
      aria: `${aria}: ${opt.label}`,
      variant: 'ghost',
      onTap: () => {
        buttons.forEach((x, i) => setOn(x, options[i].value === opt.value));
        onChange(opt.value);
      },
    });
    b.setAttribute('role', 'radio');
    setOn(b, opt.value === value);
    return b;
  });
  function setOn(b: HTMLButtonElement, on: boolean): void {
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  }
  group.append(...buttons);
  return group;
}

export function creditsChip(amount: number): HTMLElement {
  const el = h('div', 'credits', h('span', 'credits__icon', '◆'), formatCredits(amount));
  el.setAttribute('aria-label', `Credits: ${amount}`);
  return el;
}

/** Screen header: back button, title, credits. */
export function header(surface: string, title: string, credits: number | null, onBack: (() => void) | null): HTMLElement {
  const back = onBack
    ? button({ id: `${surface}_back_button`, label: '‹', aria: 'Back', variant: 'icon', onTap: onBack })
    : h('div', 'hdr__spacer');
  return h('header', 'hdr', back, h('h2', 'hdr__title', title), credits === null ? h('div', 'hdr__spacer') : creditsChip(credits));
}

export function difficultyDots(difficulty: number): HTMLElement {
  const el = pips(difficulty, 5);
  el.classList.add('pips--difficulty');
  el.setAttribute('aria-label', `Difficulty ${difficulty} of 5`);
  return el;
}

export interface StepperOpts {
  /** Buttons get `<idPrefix>_down_button` / `<idPrefix>_up_button`. */
  idPrefix: string;
  label: string;
  aria: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

/** − value + with big targets; steps are snapped so float steps don't drift. */
export function stepper(o: StepperOpts): HTMLElement {
  let value = o.value;
  const out = h('span', 'stepper__value');
  out.setAttribute('aria-live', 'polite');
  const set = (v: number) => {
    value = Math.max(o.min, Math.min(o.max, Math.round(v / o.step) * o.step));
    out.textContent = o.format(value);
    minus.disabled = value <= o.min;
    plus.disabled = value >= o.max;
  };
  const minus = button({ id: `${o.idPrefix}_down_button`, label: '−', aria: `${o.aria}: less`, variant: 'icon', onTap: () => { set(value - o.step); o.onChange(value); } });
  const plus = button({ id: `${o.idPrefix}_up_button`, label: '+', aria: `${o.aria}: more`, variant: 'icon', onTap: () => { set(value + o.step); o.onChange(value); } });
  set(value);
  return h('div', 'stepper', h('span', 'stepper__label', o.label), minus, out, plus);
}
