// Quick Race: pick any track and a lap count, then race. Pays less than the championship.
import { TRACKS, trackById } from '../../data/tracks/index.ts';
import { MAX_QUICK_LAPS, MIN_QUICK_LAPS } from '../../game/career.ts';
import { racePayout } from '../../game/economy.ts';
import { button, difficultyDots, formatCredits, formatTime, h, header, stepper } from '../kit.ts';
import { trackOutline, trackThumb } from '../trackArt.ts';
import type { AppCtx, Screen } from './context.ts';

export function quickRaceScreen(ctx: AppCtx, initialTrack?: string, initialLaps?: number): Screen {
  const career = ctx.career;
  let trackId = initialTrack ?? TRACKS[0].id;
  let laps = initialLaps ?? trackById(trackId).laps;

  const cards = TRACKS.map((t) => {
    const rec = career.save.records[t.id];
    const card = button({
      id: `quick_track_${t.id}_button`,
      label: t.name.toUpperCase(),
      aria: `Track: ${t.name}`,
      onTap: () => {
        trackId = t.id;
        refresh();
      },
    });
    card.classList.add('trackcard');
    card.dataset.track = t.id;
    card.prepend(trackThumb(t.id, 'trackcard__img'), trackOutline(t.id, 'trackcard__map'));
    card.append(
      h(
        'span',
        'trackcard__meta',
        difficultyDots(t.difficulty),
        h('span', 'trackcard__best', rec?.bestLap ? `Best ${formatTime(rec.bestLap)}` : 'No lap yet'),
      ),
      h('span', 'trackcard__blurb', t.blurb),
    );
    return card;
  });

  const lapsPicker = stepper({
    idPrefix: 'quick_laps',
    label: 'LAPS',
    aria: 'Laps',
    value: laps,
    min: MIN_QUICK_LAPS,
    max: MAX_QUICK_LAPS,
    step: 1,
    format: String,
    onChange: (v) => {
      laps = v;
      refresh();
    },
  });

  const raceBtn = button({
    id: 'quick_race_button',
    label: 'RACE',
    aria: 'Start quick race',
    variant: 'primary',
    big: true,
    onTap: () => ctx.race(career.quickRaceRequest(trackId, laps), { screen: 'quick', trackId, laps }),
  });
  const pays = h('span', 'quick__pays');

  function refresh(): void {
    for (const c of cards) c.classList.toggle('is-on', c.dataset.track === trackId);
    const t = trackById(trackId);
    const win = racePayout({ mode: 'quick', place: 1, tier: career.progressTier(), laps, standardLaps: t.laps, cupWin: null });
    pays.textContent = `1st pays ${formatCredits(win.total)}`;
    const best = career.save.records[t.id]?.bestRace[String(laps)];
    raceBtn.querySelector('.btn__sub')?.remove();
    raceBtn.append(h('span', 'btn__sub', `${t.name} · ${laps} lap${laps > 1 ? 's' : ''}${best ? ` · PB ${formatTime(best)}` : ''}`));
  }

  const el = h(
    'div',
    'screen screen--quick',
    header('quick', 'QUICK RACE', career.save.credits, () => ctx.go({ screen: 'menu' })),
    h('div', 'trackcards list-scroll', ...cards),
    h('div', 'actions', h('div', 'quick__opts', lapsPicker, pays), raceBtn),
  );
  refresh();
  return { el, backdrop: 'sunset' };
}
