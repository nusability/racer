// Quick Race: pick a world, any of its tracks and a lap count, then race. Pays less than the
// championship. Locked worlds stay visible with their tracks locked, as a reason to progress.
import { cupById } from '../../data/championships.ts';
import { trackById } from '../../data/tracks/index.ts';
import { WORLDS, worldById, worldOfTrack } from '../../data/worlds.ts';
import type { WorldDef } from '../../data/worlds.ts';
import { MAX_QUICK_LAPS, MIN_QUICK_LAPS } from '../../game/career.ts';
import { racePayout } from '../../game/economy.ts';
import { button, difficultyDots, formatCredits, formatTime, h, header, segmented, stepper } from '../kit.ts';
import { trackIfBuilt, trackOutline, trackThumb } from '../trackArt.ts';
import type { AppCtx, Screen } from './context.ts';

/** Laps shown before any track of the world is built (no standard lap count to copy). */
const DEFAULT_QUICK_LAPS = 3;

export function quickRaceScreen(ctx: AppCtx, initialWorld?: string, initialTrack?: string, initialLaps?: number): Screen {
  const career = ctx.career;
  let world = initialWorld ? worldById(initialWorld) : initialTrack ? worldOfTrack(initialTrack) : WORLDS[0];
  /** First raceable track of a world; null while none of its tracks is built yet. */
  const firstBuilt = (w: WorldDef) => w.trackIds.find((id) => trackIfBuilt(id) !== null) ?? null;
  let trackId: string | null = initialTrack ?? firstBuilt(world);
  let laps = initialLaps ?? (trackId ? trackById(trackId).laps : DEFAULT_QUICK_LAPS);
  const list = h('div', 'trackcards list-scroll');
  let cards: HTMLButtonElement[] = [];

  function buildCards(): void {
    const open = career.isWorldUnlocked(world.id);
    cards = world.trackIds.map((id) => {
      const t = trackIfBuilt(id);
      if (!t) return comingSoonCard(id);
      const rec = career.save.records[t.id];
      const card = button({
        id: `quick_track_${t.id}_button`,
        label: t.name.toUpperCase(),
        aria: `Track: ${t.name}${open ? '' : ' (locked)'}`,
        disabled: !open,
        onTap: () => {
          trackId = t.id;
          refresh();
        },
      });
      card.classList.add('trackcard');
      card.dataset.track = t.id;
      const outline = trackOutline(t.id, 'trackcard__map');
      card.prepend(trackThumb(t.id, 'trackcard__img'));
      if (outline) card.append(outline);
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
    list.replaceChildren(...cards);
    list.scrollTo(0, 0);
  }

  /** A track not built yet: its world's gradient, its id-free label, never raceable. */
  function comingSoonCard(id: string): HTMLButtonElement {
    const card = button({ id: `quick_track_${id}_button`, label: 'COMING SOON', aria: 'Track coming soon', disabled: true, onTap: () => {} });
    card.classList.add('trackcard', 'is-soon');
    card.dataset.track = id;
    card.prepend(trackThumb(id, 'trackcard__img'));
    card.append(h('span', 'trackcard__blurb', 'This track is still being built.'));
    return card;
  }

  const worldTabs = segmented(
    'quick_world',
    'World',
    WORLDS.map((w) => ({ value: w.id, label: `${career.isWorldUnlocked(w.id) ? '' : '🔒 '}${w.name.toUpperCase()}` })),
    world.id,
    (id) => {
      world = worldById(id);
      trackId = firstBuilt(world);
      if (trackId) laps = trackById(trackId).laps;
      lapsPicker.replaceWith((lapsPicker = makeLapsPicker()));
      buildCards();
      refresh();
    },
  );
  worldTabs.classList.add('quick__worlds');

  const makeLapsPicker = () =>
    stepper({
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
  let lapsPicker = makeLapsPicker();

  const raceBtn = button({
    id: 'quick_race_button',
    label: 'RACE',
    aria: 'Start quick race',
    variant: 'primary',
    big: true,
    onTap: () => {
      if (!trackId) throw new Error('Quick race: RACE tapped with no track selected');
      ctx.race(career.quickRaceRequest(trackId, laps), { screen: 'quick', worldId: world.id, trackId, laps });
    },
  });
  const pays = h('span', 'quick__pays');

  function refresh(): void {
    for (const c of cards) c.classList.toggle('is-on', c.dataset.track === trackId);
    raceBtn.querySelector('.btn__sub')?.remove();
    if (!trackId) {
      pays.textContent = `${world.name}'s tracks are still being built`;
      raceBtn.disabled = true;
      raceBtn.append(h('span', 'btn__sub', 'Coming soon'));
      return;
    }
    const t = trackById(trackId);
    if (!career.isWorldUnlocked(world.id)) {
      const by = world.unlockedBy ? cupById(world.unlockedBy).name : '';
      pays.textContent = `Win the ${by} to open ${world.name}`;
      raceBtn.disabled = true;
      raceBtn.append(h('span', 'btn__sub', 'Locked'));
      return;
    }
    raceBtn.disabled = false;
    const win = racePayout({ mode: 'quick', place: 1, cup: career.quickRacePayCup(t.id), laps, standardLaps: t.laps, cupWin: null });
    pays.textContent = `1st pays ${formatCredits(win.total)}`;
    const best = career.save.records[t.id]?.bestRace[String(laps)];
    raceBtn.append(h('span', 'btn__sub', `${t.name} · ${laps} lap${laps > 1 ? 's' : ''}${best ? ` · PB ${formatTime(best)}` : ''}`));
  }

  const el = h(
    'div',
    'screen screen--quick',
    header('quick', 'QUICK RACE', career.save.credits, () => ctx.go({ screen: 'menu' })),
    worldTabs,
    list,
    h('div', 'actions', h('div', 'quick__opts', lapsPicker, pays), raceBtn),
  );
  buildCards();
  refresh();
  return { el, backdrop: 'sunset' };
}
