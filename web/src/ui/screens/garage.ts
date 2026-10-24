// Garage: racer carousel over the 3D showroom, effective stats, buy/select, and upgrades.
// Prices are always on the button before the tap; unaffordable buttons are disabled.
import type { RacerStats } from '../../core/types.ts';
import { RACERS } from '../../data/racers.ts';
import { worldById } from '../../data/worlds.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES, effectiveStats } from '../../data/upgrades.ts';
import { button, creditsChip, formatCredits, h, panel, pips, statBar } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

interface StatSpec {
  label: string;
  get: (s: RacerStats) => number;
}

const STATS: StatSpec[] = [
  { label: 'SPEED', get: (s) => s.topSpeed },
  { label: 'ACCEL', get: (s) => s.accel },
  { label: 'HANDLING', get: (s) => s.handling },
  { label: 'BOOST', get: (s) => s.boostPower },
  { label: 'BOOST TANK', get: (s) => s.boostTank },
  { label: 'ARMOUR', get: (s) => s.armor },
];

/**
 * Bars are scaled to the best stock glider for each stat, so the catalogue's differences read
 * at a glance: the best glider fills BEST_GLIDER_FILL of the bar, the weakest sits
 * WEAKEST_SPREAD of the stock spread above empty, and upgrades extend toward the end.
 */
const BEST_GLIDER_FILL = 0.8;
const WEAKEST_SPREAD = 0.25;

/** Per stat: the value drawn as empty, and the value drawn at BEST_GLIDER_FILL. */
const RANGES = STATS.map((st) => {
  const stock = RACERS.map((r) => st.get(r.base));
  const best = Math.max(...stock);
  const weakest = Math.min(...stock);
  // When every glider is equal on a stat the spread is 0; scale off the value itself instead.
  const spread = best - weakest || best;
  return { lo: weakest - WEAKEST_SPREAD * spread, best };
});

function fillOf(i: number, v: number): number {
  const { lo, best } = RANGES[i];
  return (BEST_GLIDER_FILL * (v - lo)) / (best - lo);
}

export function garageScreen(ctx: AppCtx, initialRacer?: string): Screen {
  const career = ctx.career;
  let index = RACERS.findIndex((r) => r.id === (initialRacer ?? career.save.selectedRacer));
  if (index < 0) throw new Error(`Garage: unknown racer "${initialRacer}"`);

  const root = h('div', 'screen screen--garage');
  /** The racer index on screen, so a re-render can tell a purchase from a change of glider. */
  let shownIndex = -1;

  function render(): void {
    const racer = RACERS[index];
    ctx.showroom.show(racer.visual);
    const owned = career.owns(racer.id);
    const selected = career.save.selectedRacer === racer.id;
    const levels = career.upgradeLevels(racer.id);
    const base = racer.base;
    const eff = effectiveStats(racer, levels);
    const credits = career.save.credits;

    const bars = STATS.map((st, i) => {
      return statBar(st.label, fillOf(i, st.get(base)), fillOf(i, st.get(eff)));
    });

    const info = h(
      'div',
      'garage__info',
      h('div', 'garage__name', racer.name.toUpperCase()),
      h('div', 'garage__pilot', `Pilot: ${racer.pilot}`),
      h('p', 'garage__blurb', racer.blurb),
      panel(null, h('div', 'stats', ...bars)),
    );

    let primary: HTMLButtonElement;
    if (!owned && !career.isRacerOnSale(racer.id)) {
      // Not on sale yet: say what opens it, so the glider reads as a goal rather than a wall.
      const reason = `Unlocks with ${worldById(racer.unlockWorld as string).name}`;
      primary = button({ id: 'garage_locked_button', label: 'LOCKED', sub: reason, aria: `${racer.name}: ${reason}`, variant: 'ghost', disabled: true, onTap: () => {} });
      primary.classList.add('is-status', 'is-locked');
    } else if (!owned) {
      primary = button({
        id: 'garage_buy_button',
        label: 'BUY',
        sub: formatCredits(racer.price),
        aria: `Buy ${racer.name} for ${racer.price} credits`,
        variant: 'primary',
        disabled: credits < racer.price,
        onTap: () => {
          if (career.buyRacer(racer.id) === 'ok') ctx.audio.oneShot('buy');
          render();
        },
      });
    } else if (!selected) {
      primary = button({
        id: 'garage_select_button',
        label: 'SELECT',
        aria: `Select ${racer.name}`,
        variant: 'primary',
        onTap: () => {
          career.selectRacer(racer.id);
          render();
        },
      });
    } else {
      primary = button({ id: 'garage_selected_button', label: '✓ SELECTED', aria: `${racer.name} is selected`, variant: 'ghost', disabled: true, onTap: () => {} });
      primary.classList.add('is-status');
    }

    const dots = h('div', 'carousel__dots', ...RACERS.map((r, i) => h('span', `dot${i === index ? ' is-on' : ''}${career.owns(r.id) ? ' is-owned' : career.isRacerOnSale(r.id) ? '' : ' is-locked'}`)));
    const prev = button({ id: 'garage_prev_button', label: '‹', aria: 'Previous racer', variant: 'icon', onTap: () => step(-1) });
    const next = button({ id: 'garage_next_button', label: '›', aria: 'Next racer', variant: 'icon', onTap: () => step(1) });
    prev.classList.add('carousel__prev');
    next.classList.add('carousel__next');
    const carousel = h('div', 'carousel', h('div', 'garage__window', prev, next), h('div', 'carousel__foot', dots, primary));

    const rows = UPGRADES.map((u) => {
      const lvl = levels[u.id];
      const cost = owned ? career.nextUpgradeCost(racer.id, u.id) : null;
      const buy = button({
        id: `garage_upgrade_${u.id}_button`,
        label: cost === null ? (owned ? 'MAX' : '—') : formatCredits(cost),
        aria: cost === null ? `${u.name}: maxed` : `Upgrade ${u.name} for ${cost} credits`,
        variant: 'secondary',
        disabled: cost === null || credits < cost,
        onTap: () => {
          if (career.buyUpgrade(racer.id, u.id) === 'ok') ctx.audio.oneShot('buy');
          render();
        },
      });
      buy.classList.add('upg__buy');
      return h('div', 'upg', h('div', 'upg__text', h('span', 'upg__name', u.name), pips(lvl, MAX_UPGRADE_LEVEL), h('span', 'upg__blurb', u.blurb)), buy);
    });
    const upgrades = panel(owned ? 'UPGRADES' : 'UPGRADES · BUY TO UNLOCK', h('div', `upgs${owned ? '' : ' is-locked'}`, ...rows));

    const back = button({ id: 'garage_back_button', label: '‹', aria: 'Back', variant: 'icon', onTap: () => ctx.go({ screen: 'menu' }) });
    // A purchase re-renders the whole screen; keep the player where they were scrolled to (which
    // container scrolls depends on the orientation), unless they moved to another glider.
    const scrolled = index === shownIndex ? scrollPositions(root) : null;
    shownIndex = index;
    root.replaceChildren(
      h('header', 'hdr hdr--garage', back, h('h2', 'hdr__title', 'GARAGE'), creditsChip(credits)),
      h('div', 'garage__body', info, h('div', 'garage__stage', carousel), h('div', 'garage__upgrades', upgrades)),
    );
    if (scrolled) restoreScroll(root, scrolled);
  }

  function step(d: number): void {
    index = (index + d + RACERS.length) % RACERS.length;
    render();
  }

  render();
  return { el: root, backdrop: 'showroom', dispose: () => ctx.showroom.hide() };
}

/** Scroll offsets of every scrolled element under `root` (root included), in document order. */
function scrollPositions(root: HTMLElement): number[] {
  return [root, ...root.querySelectorAll<HTMLElement>('*')].map((el) => el.scrollTop);
}

/**
 * Puts scroll offsets back after a re-render. The screen rebuilds the same structure for the same
 * glider, so elements line up by document order.
 */
function restoreScroll(root: HTMLElement, positions: number[]) {
  const els = [root, ...root.querySelectorAll<HTMLElement>('*')];
  els.forEach((el, i) => {
    const top = positions[i];
    if (top) el.scrollTop = top;
  });
}
