// Championship: the three cup cards, then a cup view with its races, standings and one big
// RACE button for the next race.
import { CUPS, cupById } from '../../data/championships.ts';
import type { CupDef } from '../../data/championships.ts';
import { racerById } from '../../data/racers.ts';
import { trackById } from '../../data/tracks/index.ts';
import { cupStates } from '../../game/career.ts';
import { racePayout } from '../../game/economy.ts';
import { button, difficultyDots, formatCredits, h, header, panel } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

function prizeLine(cup: CupDef): string {
  const p = racePayout({ mode: 'championship', place: 1, tier: cup.tier, laps: 1, standardLaps: 1, cupWin: { firstTime: true } });
  return `1st pays ${formatCredits(p.race)} · Cup win +${formatCredits(p.cupBonus)}`;
}

export function championshipScreen(ctx: AppCtx): Screen {
  const run = ctx.career.save.cup;
  const cards = cupStates(ctx.career).map(({ cup, unlocked, won, inProgress }) => {
    const prev = CUPS.find((c) => c.unlocks === cup.id);
    const status = !unlocked
      ? `🔒 Win the ${prev?.name ?? 'previous cup'} to unlock`
      : inProgress && run
        ? `Race ${run.raceIndex + 1} of ${cup.trackIds.length}`
        : won
          ? '★ Won — race it again'
          : 'Ready';
    const card = button({
      id: `championship_${cup.id}_button`,
      label: cup.name.toUpperCase(),
      aria: `${cup.name}${unlocked ? '' : ' (locked)'}`,
      disabled: !unlocked,
      onTap: () => ctx.go({ screen: 'cup', cupId: cup.id }),
    });
    card.classList.add('cupcard', `cupcard--t${cup.tier}`);
    if (won) card.classList.add('is-won');
    if (inProgress) card.classList.add('is-live');
    card.prepend(h('span', 'cupcard__tier', `CUP ${cup.tier}`));
    card.append(
      h('span', 'cupcard__blurb', cup.blurb),
      h('span', 'cupcard__prize', prizeLine(cup)),
      h('span', 'cupcard__status', status),
    );
    return card;
  });
  const el = h(
    'div',
    'screen screen--champ',
    header('championship', 'CHAMPIONSHIP', ctx.career.save.credits, () => ctx.go({ screen: 'menu' })),
    h('div', 'cupcards', ...cards),
  );
  return { el, backdrop: 'sunset' };
}

export function cupScreen(ctx: AppCtx, cupId: string): Screen {
  const career = ctx.career;
  const cup = cupById(cupId);
  const run = career.save.cup;
  const live = run?.cupId === cup.id ? run : null;

  const races = cup.trackIds.map((id, i) => {
    const t = trackById(id);
    const state = !live ? 'todo' : i < live.raceIndex ? 'done' : i === live.raceIndex ? 'next' : 'todo';
    return h(
      'li',
      `racelist__row is-${state}`,
      h('span', 'racelist__n', state === 'done' ? '✓' : String(i + 1)),
      h('span', 'racelist__name', t.name),
      difficultyDots(t.difficulty),
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
        sub: `Race 1 · ${trackById(cup.trackIds[0]).name}`,
        aria: `Start the ${cup.name}`,
        variant: 'primary',
        big: true,
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
    header('cup', cup.name.toUpperCase(), career.save.credits, () => ctx.go({ screen: 'championship' })),
    h('div', 'cup__body', panel('RACES', h('ol', 'racelist', ...races)), panel('STANDINGS', table)),
    actions,
  );
  return { el, backdrop: 'sunset' };
}
