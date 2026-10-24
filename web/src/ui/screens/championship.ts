// Championship: world cards → a world's three cups (rookie, pro, elite) → a cup view with its
// races, standings and one big RACE button for the next race.
import { CUPS, cupById } from '../../data/championships.ts';
import type { CupDef } from '../../data/championships.ts';
import { racerById } from '../../data/racers.ts';
import { trackById } from '../../data/tracks/index.ts';
import { WORLDS, worldById } from '../../data/worlds.ts';
import { cupStates } from '../../game/career.ts';
import { racePayout } from '../../game/economy.ts';
import { button, difficultyDots, formatCredits, h, header, panel } from '../kit.ts';
import { trackIfBuilt, trackThumb } from '../trackArt.ts';
import type { AppCtx, Screen } from './context.ts';

/** Cup tier as the player reads it. */
export const TIER_NAMES = ['ROOKIE', 'PRO', 'ELITE'];
/** Track previews shown on a world card. */
const WORLD_CARD_THUMBS = 3;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** "Field is 2% faster than your Dustwing", or null when the player's glider keeps up. */
function fieldWarning(ctx: AppCtx, cup: CupDef): string | null {
  const pct = Math.round(ctx.career.fieldEdge(cup) * 100);
  if (pct < 1) return null;
  return `⚠ Field is ${pct}% faster than your ${racerById(ctx.career.save.selectedRacer).name}`;
}

function prizeLine(cup: CupDef): string {
  const p = racePayout({ mode: 'championship', place: 1, cup, laps: 1, standardLaps: 1, cupWin: { firstTime: true } });
  return `1st pays ${formatCredits(p.race)} · Cup win +${formatCredits(p.cupBonus)}`;
}

export function championshipScreen(ctx: AppCtx): Screen {
  const career = ctx.career;
  const cards = WORLDS.map((w) => {
    const unlocked = career.isWorldUnlocked(w.id);
    const lockedBy = !unlocked && w.unlockedBy ? cupById(w.unlockedBy) : null;
    const won = w.cupIds.filter((id) => career.save.wonCups.includes(id)).length;
    const live = career.save.cup && cupById(career.save.cup.cupId).worldId === w.id;
    const status = lockedBy
      ? `🔒 Win the ${lockedBy.name} to open`
      : career.isWorldChampion(w.id)
        ? '👑 World champion'
        : live
          ? 'Cup in progress'
          : `${won}/${w.cupIds.length} cups won`;
    const card = button({
      id: `championship_${w.id}_button`,
      label: w.name.toUpperCase(),
      aria: `${w.name}${unlocked ? '' : ' (locked)'}`,
      disabled: !unlocked,
      onTap: () => ctx.go({ screen: 'world', worldId: w.id }),
    });
    card.classList.add('worldcard');
    if (live) card.classList.add('is-live');
    card.style.setProperty('--world-from', hex(w.card.from));
    card.style.setProperty('--world-to', hex(w.card.to));
    const pips = h('span', 'worldcard__cups', ...w.cupIds.map((id) => h('span', career.save.wonCups.includes(id) ? 'cuppip is-won' : 'cuppip', '🏆')));
    card.append(
      h('span', 'worldcard__blurb', w.blurb),
      h('span', 'worldcard__thumbs', ...w.trackIds.slice(0, WORLD_CARD_THUMBS).map((t) => trackThumb(t, 'worldcard__thumb'))),
      h('span', 'worldcard__foot', pips, h('span', 'worldcard__status', status)),
    );
    return card;
  });
  const el = h(
    'div',
    'screen screen--champ',
    header('championship', 'CHAMPIONSHIP', career.save.credits, () => ctx.go({ screen: 'menu' })),
    h('div', 'worldcards list-scroll', ...cards),
  );
  return { el, backdrop: 'sunset' };
}

export function worldScreen(ctx: AppCtx, worldId: string): Screen {
  const run = ctx.career.save.cup;
  const world = worldById(worldId);
  const cards = cupStates(ctx.career, worldId).map(({ cup, unlocked, won, inProgress }) => {
    const prev = CUPS.find((c) => c.unlocks === cup.id);
    const status = !unlocked
      ? `🔒 Win the ${prev?.name ?? 'previous cup'} to unlock`
      : inProgress && run
        ? `Race ${run.raceIndex + 1} of ${cup.trackIds.length}`
        : won
          ? '★ Won — race it again'
          : 'Ready';
    const card = button({
      id: `world_${cup.id}_button`,
      label: cup.name.toUpperCase(),
      aria: `${cup.name}${unlocked ? '' : ' (locked)'}`,
      disabled: !unlocked,
      onTap: () => ctx.go({ screen: 'cup', cupId: cup.id }),
    });
    card.classList.add('cupcard', `cupcard--t${cup.tier}`);
    if (won) card.classList.add('is-won');
    if (inProgress) card.classList.add('is-live');
    card.prepend(h('span', 'cupcard__tier', TIER_NAMES[cup.tier - 1]));
    card.append(
      h('span', 'cupcard__blurb', cup.blurb),
      h('span', 'cupcard__prize', prizeLine(cup)),
    );
    const warning = unlocked ? fieldWarning(ctx, cup) : null;
    if (warning) card.append(h('span', 'cupcard__warn', warning));
    card.append(h('span', 'cupcard__status', status));
    return card;
  });
  const el = h(
    'div',
    'screen screen--champ',
    header('world', world.name.toUpperCase(), ctx.career.save.credits, () => ctx.go({ screen: 'championship' })),
    h('div', 'cupcards', ...cards),
  );
  return { el, backdrop: 'sunset' };
}

export function cupScreen(ctx: AppCtx, cupId: string): Screen {
  const career = ctx.career;
  const cup = cupById(cupId);
  const run = career.save.cup;
  const live = run?.cupId === cup.id ? run : null;

  // A cup can't start until every one of its tracks is built (a new world arrives in stages).
  const built = cup.trackIds.map(trackIfBuilt);
  const allBuilt = built.every((t) => t !== null);
  const races = cup.trackIds.map((id, i) => {
    const t = built[i];
    const state = !live ? 'todo' : i < live.raceIndex ? 'done' : i === live.raceIndex ? 'next' : 'todo';
    return h(
      'li',
      `racelist__row is-${state}`,
      trackThumb(id, 'racelist__img'),
      h('span', 'racelist__n', state === 'done' ? '✓' : String(i + 1)),
      h('span', 'racelist__name', t ? t.name : 'Coming soon'),
      t ? difficultyDots(t.difficulty) : h('span', 'note', '—'),
    );
  });

  const standings = career.standings(cup, live?.points ?? {}, null);
  const table = h(
    'table',
    'table',
    h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'PILOT'), h('th', null, 'RACER'), h('th', 'num', 'PTS'))),
    h(
      'tbody',
      null,
      ...standings.map((r) =>
        h(
          'tr',
          r.isPlayer ? 'is-player' : '',
          h('td', null, String(r.position)),
          h('td', null, r.name),
          h('td', 'dim', racerById(r.racerId).name),
          h('td', 'num', String(r.points)),
        ),
      ),
    ),
  );

  const actions = h('div', 'actions');
  const warning = fieldWarning(ctx, cup);
  if (warning) actions.append(h('p', 'note note--warn', `${warning}. Upgrade in the garage to match it.`));
  if (live) {
    const t = trackById(cup.trackIds[live.raceIndex]);
    actions.append(
      button({
        id: 'cup_abandon_button',
        label: 'ABANDON',
        aria: 'Abandon this cup',
        variant: 'ghost',
        onTap: () => {
          career.abandonCup();
          ctx.go({ screen: 'cup', cupId: cup.id });
        },
      }),
      button({
        id: 'cup_race_button',
        label: 'RACE',
        sub: `Race ${live.raceIndex + 1}/${cup.trackIds.length} · ${t.name}`,
        aria: `Race ${live.raceIndex + 1}: ${t.name}`,
        variant: 'primary',
        big: true,
        onTap: () => ctx.race(career.nextChampionshipRequest(), { screen: 'cup', cupId: cup.id }),
      }),
    );
  } else {
    if (run) actions.append(h('p', 'note', `Starting abandons your ${cupById(run.cupId).name} run (race ${run.raceIndex + 1}).`));
    actions.append(
      button({
        id: 'cup_start_button',
        label: 'START CUP',
        sub: allBuilt ? `Race 1 · ${trackById(cup.trackIds[0]).name}` : 'Tracks coming soon',
        aria: `Start the ${cup.name}`,
        variant: 'primary',
        big: true,
        disabled: !allBuilt,
        onTap: () => {
          career.startCup(cup.id);
          ctx.race(career.nextChampionshipRequest(), { screen: 'cup', cupId: cup.id });
        },
      }),
    );
  }

  const el = h(
    'div',
    'screen screen--cup',
    header('cup', cup.name.toUpperCase(), career.save.credits, () => ctx.go({ screen: 'world', worldId: cup.worldId })),
    h('div', 'cup__body', panel('RACES', h('ol', 'racelist', ...races)), panel('STANDINGS', table)),
    actions,
  );
  return { el, backdrop: 'sunset' };
}
