// Results: place, times, credits, standings. ONE primary button starts the next race at once
// (north-star: finish line to next start is one tap).
import { cupById } from '../../data/championships.ts';
import { worldById } from '../../data/worlds.ts';
import { trackById } from '../../data/tracks/index.ts';
import type { RaceReport } from '../../game/career.ts';
import type { RaceRequest } from '../../game/types.ts';
import { button, formatCredits, formatTime, h, ordinal, panel } from '../kit.ts';
import { wreckCopy } from '../wreckCopy.ts';
import type { AppCtx, Nav, Screen } from './context.ts';

interface NextStep {
  label: string;
  aria: string;
  build: () => RaceRequest;
  back: Nav;
}

function nextStep(ctx: AppCtx, report: RaceReport): NextStep {
  const career = ctx.career;
  const req = report.request;
  if (req.mode === 'quick') {
    // After a wreck the same race is a retry; after a finish it's another go.
    const wrecked = report.playerWreck !== null;
    return {
      label: wrecked ? 'RETRY' : 'RACE AGAIN',
      aria: wrecked ? 'Retry this race' : 'Race again',
      build: () => career.quickRaceRequest(req.trackId, req.laps),
      back: { screen: 'quick', trackId: req.trackId, laps: req.laps },
    };
  }
  const cupReport = report.cup;
  if (!cupReport) throw new Error(`Championship report ${report.raceId} has no cup section`);
  const cup = cupById(cupReport.cupId);
  if (!cupReport.finished) {
    return { label: 'NEXT RACE', aria: 'Next race', build: () => career.nextChampionshipRequest(), back: { screen: 'cup', cupId: cup.id } };
  }
  const startCup = (id: string): NextStep => ({
    label: id === cup.id ? (cupReport.won ? 'DEFEND TITLE' : 'RETRY CUP') : 'NEXT CUP',
    aria: id === cup.id ? `Race the ${cup.name} again` : `Start the ${cupById(id).name}`,
    build: () => {
      career.startCup(id);
      return career.nextChampionshipRequest();
    },
    back: { screen: 'cup', cupId: id },
  });
  return startCup(cupReport.won && cup.unlocks ? cup.unlocks : cup.id);
}

function resultsTable(report: RaceReport): HTMLElement {
  const pts = report.cup?.pointsAwarded;
  const head = h('tr', null, h('th', null, '#'), h('th', null, 'PILOT'), h('th', 'num', 'TIME'), h('th', 'num hide-narrow', 'BEST LAP'));
  if (pts) head.append(h('th', 'num', 'PTS'));
  const rows = report.results.map((r) => {
    const tr = h(
      'tr',
      `${r.isPlayer ? 'is-player' : ''}${r.dnf ? ' is-dnf' : ''}`,
      h('td', null, r.dnf ? '✕' : String(r.place)),
      h('td', null, r.name),
      r.dnf ? h('td', 'num dnf', 'WRECKED') : h('td', 'num', r.time === null ? '--' : formatTime(r.time)),
      h('td', 'num hide-narrow', formatTime(r.bestLap)),
    );
    if (pts) tr.append(h('td', 'num hot', `+${pts[r.id] ?? 0}`));
    return tr;
  });
  return h('table', 'table', h('thead', null, head), h('tbody', null, ...rows));
}

function standingsTable(report: RaceReport): HTMLElement | null {
  if (!report.cup) return null;
  return h(
    'table',
    'table',
    h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'PILOT'), h('th', 'num', 'PTS'))),
    h(
      'tbody',
      null,
      ...report.cup.standings.map((r) =>
        h('tr', r.isPlayer ? 'is-player' : '', h('td', null, String(r.position)), h('td', null, r.name), h('td', 'num', String(r.points))),
      ),
    ),
  );
}

function headline(report: RaceReport): HTMLElement {
  const c = report.cup;
  const wreck = report.playerWreck ? wreckCopy(report.playerWreck) : null;
  const place = wreck
    ? h('div', 'results__wreck', h('div', 'results__wreck-title', wreck.title), h('div', 'results__wreck-sub', `${wreck.sub} · ${c ? 'no points' : 'no pay'}`))
    : h('div', `results__place p${report.playerPlace}`, ordinal(report.playerPlace).toUpperCase());
  const track = trackById(report.request.trackId);
  const sub = c
    ? `${cupById(c.cupId).name} · Race ${c.raceIndex + 1}/${c.racesTotal} · ${track.name}`
    : `Quick race · ${track.name} · ${report.request.laps} lap${report.request.laps > 1 ? 's' : ''}`;
  const earned = h(
    'div',
    'results__earned',
    h('span', 'results__plus', `+${formatCredits(report.payout.race)}`),
    report.payout.cupBonus > 0 ? h('span', 'results__bonus', `CUP BONUS +${formatCredits(report.payout.cupBonus)}`) : null,
    h('span', 'results__balance', `Balance ${formatCredits(report.creditsAfter)}`),
  );
  const badges = h(
    'div',
    'results__badges',
    report.newBestLap ? h('span', 'badge badge--cyan', 'NEW BEST LAP') : null,
    report.newBestRace ? h('span', 'badge badge--cyan', 'NEW BEST TIME') : null,
  );
  return h('div', 'results__head', h('div', 'results__sub', sub), place, earned, badges);
}

function celebration(report: RaceReport): HTMLElement | null {
  const c = report.cup;
  if (!c?.finished) return null;
  const cup = cupById(c.cupId);
  if (!c.won) {
    const me = c.standings.find((r) => r.isPlayer);
    return h('div', 'celebrate celebrate--lost', h('div', 'celebrate__title', `${cup.name.toUpperCase()} OVER`), h('div', 'celebrate__sub', `You finished ${ordinal(me?.position ?? 0)} overall. Win it to move up.`));
  }
  const world = worldById(cup.worldId);
  const title = cup.unlocks === null ? `${world.name.toUpperCase()} CHAMPION` : `${cup.name.toUpperCase()} WON`;
  const opened = [
    ...(c.unlockedCupId ? [cupById(c.unlockedCupId).name] : []),
    ...c.unlockedWorldIds.map((id) => `the ${worldById(id).name}`),
  ];
  const sub = c.becameChampion
    ? `You conquered the ${cup.name}. ${world.name} is yours.`
    : opened.length
      ? `${opened.join(' and ')} unlocked!`
      : 'Champion again.';
  return h('div', `celebrate${cup.unlocks === null ? ' celebrate--gold' : ''}`, h('div', 'celebrate__trophy', '🏆'), h('div', 'celebrate__title', title), h('div', 'celebrate__sub', sub));
}

export function resultsScreen(ctx: AppCtx, report: RaceReport): Screen {
  const next = nextStep(ctx, report);
  const standings = standingsTable(report);
  const actions = h(
    'div',
    'actions',
    button({ id: 'results_menu_button', label: 'MENU', aria: 'Back to menu', variant: 'ghost', onTap: () => ctx.go({ screen: 'menu' }) }),
    button({ id: 'results_next_button', label: next.label, aria: next.aria, variant: 'primary', big: true, onTap: () => ctx.race(next.build(), next.back) }),
  );
  const el = h(
    'div',
    `screen screen--results${report.cup ? ' has-cup' : ''}${report.cup?.finished ? ' is-cupend' : ''}`,
    h(
      'div',
      'results__body list-scroll',
      h('div', 'results__left', celebration(report), headline(report)),
      panel('RESULTS', resultsTable(report)),
      standings ? panel(report.cup?.finished ? 'FINAL STANDINGS' : 'STANDINGS', standings) : null,
    ),
    actions,
  );
  return { el, backdrop: 'sunset' };
}
