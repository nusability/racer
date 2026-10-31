// Quick Race: pick a world, any of its tracks and (on a circuit) a lap count, then race. Pays
// less than the championship. Locked worlds stay visible with their tracks locked, as a reason
// to progress. A sprint is raced once: it has no lap count to pick.
// Time Trial picks from the same worlds and tracks, alone against the track's best ghost: no
// lap count (a circuit is flown lap after lap) and no pay; each card shows its ghost.
import { cupById } from '../../data/championships.ts';
import { trackById } from '../../data/tracks/index.ts';
import { WORLDS, worldById, worldOfTrack } from '../../data/worlds.ts';
import type { WorldDef } from '../../data/worlds.ts';
import { MAX_QUICK_LAPS, MIN_QUICK_LAPS } from '../../game/career.ts';
import { racePayout } from '../../game/economy.ts';
import { racerById } from '../../data/racers.ts';
import { loadGhost } from '../../game/ghostStore.ts';
import { button, difficultyDots, formatCredits, formatTime, h, header, segmented, stepper } from '../kit.ts';
import { trackIfBuilt, trackOutline, trackThumb } from '../trackArt.ts';
import type { AppCtx, Screen } from './context.ts';

/** Laps shown before any track of the world is built (no standard lap count to copy). */
const DEFAULT_QUICK_LAPS = 3;

export function quickRaceScreen(ctx: AppCtx, initialWorld?: string, initialTrack?: string, initialLaps?: number): Screen {
  return trackPicker(ctx, 'quick', initialWorld, initialTrack, initialLaps);
}

export function timeTrialScreen(ctx: AppCtx, initialWorld?: string, initialTrack?: string): Screen {
  return trackPicker(ctx, 'trial', initialWorld, initialTrack, undefined);
}

/** `surface` names the screen and prefixes its ids: 'quick' races the field, 'trial' the ghost. */
function trackPicker(ctx: AppCtx, surface: 'quick' | 'trial', initialWorld: string | undefined, initialTrack: string | undefined, initialLaps: number | undefined): Screen {
  const career = ctx.career;
  const trial = surface === 'trial';
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
      const best = trial ? (loadGhost(ctx.ghosts, t.id)?.run.time ?? null) : t.course === 'sprint' ? rec?.bestRace['1'] : rec?.bestLap;
      const card = button({
        id: `${surface}_track_${t.id}_button`,
        label: t.name.toUpperCase(),
        aria: `Track: ${t.name}${open ? '' : ' (locked)'}`,
        disabled: !open,
        onTap: () => {
          // A sprint's single run, or back to a circuit from one: the track's own distance.
          const wasSprint = trackId !== null && trackById(trackId).course === 'sprint';
          trackId = t.id;
          if (t.course === 'sprint' || wasSprint) {
            laps = t.laps;
            lapsPicker.replaceWith((lapsPicker = makeLapsPicker()));
          }
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
          h('span', 'trackcard__best', best ? `${trial ? 'Ghost' : 'Best'} ${t.course === 'sprint' ? 'run ' : ''}${formatTime(best)}` : t.course === 'sprint' ? 'No run yet' : 'No lap yet'),
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
    const card = button({ id: `${surface}_track_${id}_button`, label: 'COMING SOON', aria: 'Track coming soon', disabled: true, onTap: () => {} });
    card.classList.add('trackcard', 'is-soon');
    card.dataset.track = id;
    card.prepend(trackThumb(id, 'trackcard__img'));
    card.append(h('span', 'trackcard__blurb', 'This track is still being built.'));
    return card;
  }

  const worldTabs = segmented(
    `${surface}_world`,
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
  // With more worlds than fit, the tab strip scrolls: keep the chosen world's tab in view.
  const showWorldTab = () => worldTabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  worldTabs.addEventListener('click', showWorldTab);
  requestAnimationFrame(showWorldTab);

  const course = (value: string) => h('div', 'stepper', h('span', 'stepper__label', 'COURSE'), h('span', 'stepper__value', value));
  const isSprint = () => trackId !== null && trackById(trackId).course === 'sprint';
  const makeLapsPicker = () =>
    trial
      ? course(isSprint() ? 'SPRINT' : 'FLYING LAPS')
      : isSprint()
      ? course('SPRINT')
      : stepper({
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
    id: `${surface}_race_button`,
    label: trial ? 'START TRIAL' : 'RACE',
    aria: trial ? 'Start time trial' : 'Start quick race',
    variant: 'primary',
    big: true,
    onTap: () => {
      if (!trackId) throw new Error(`${surface}: start tapped with no track selected`);
      if (trial) ctx.race(career.timeTrialRequest(trackId), { screen: 'trial', worldId: world.id, trackId });
      else ctx.race(career.quickRaceRequest(trackId, laps), { screen: 'quick', worldId: world.id, trackId, laps });
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
    if (trial) {
      const ghost = loadGhost(ctx.ghosts, t.id);
      pays.textContent = ghost ? `Ghost ${formatTime(ghost.run.time)} · ${racerById(ghost.glider).name}` : 'No ghost yet: your first run sets it';
      raceBtn.append(h('span', 'btn__sub', `${t.name} · ${t.course === 'sprint' ? 'sprint' : 'flying laps'} · ${racerById(career.save.selectedRacer).name}`));
      return;
    }
    const win = racePayout({ mode: 'quick', place: 1, cup: career.quickRacePayCup(t.id), laps, standardLaps: t.laps, cupWin: null });
    pays.textContent = `1st pays ${formatCredits(win.total)}`;
    const best = career.save.records[t.id]?.bestRace[String(laps)];
    const distance = t.course === 'sprint' ? 'sprint' : `${laps} lap${laps > 1 ? 's' : ''}`;
    raceBtn.append(h('span', 'btn__sub', `${t.name} · ${distance}${best ? ` · PB ${formatTime(best)}` : ''}`));
  }

  const el = h(
    'div',
    `screen screen--quick${trial ? ' screen--trial' : ''}`,
    header(surface, trial ? 'TIME TRIAL' : 'QUICK RACE', career.save.credits, () => ctx.go({ screen: 'menu' })),
    worldTabs,
    list,
    h('div', 'actions', h('div', 'quick__opts', lapsPicker, pays), raceBtn),
  );
  buildCards();
  refresh();
  return { el, backdrop: 'sunset' };
}
