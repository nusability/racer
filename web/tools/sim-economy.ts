// Career pacing: walks a decent player through every world's cups in unlock order, earning
// what the cup study says such a player earns, and buying by a simple sensible policy.
// Prints credits, purchases and machine at each cup start, then the time-to-unlock milestones.
//   node --experimental-strip-types tools/sim-economy.ts
//
// Earnings are expected values: each race pays the study's place distribution times the
// payout table; a cup is retried until won, where wins accrue at the study's cup-win rate per
// attempt (an attempt that brings the running total to 1 is the win). Deterministic.

import { WORLDS } from '../src/data/worlds.ts';
import { cupById, type CupDef } from '../src/data/championships.ts';
import { RACERS, racerById } from '../src/data/racers.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES, noUpgrades, upgradeCost, type UpgradeLevels } from '../src/data/upgrades.ts';
import { racePayout } from '../src/game/economy.ts';
import { ASSUMED, DECENT, studyCup } from './sim-cups.ts';

/** A glider is worth saving for when it costs at least this multiple of the current one: small steps are skipped. */
const GLIDER_STEP = 1.5;
/** While a better glider is still to buy, upgrades may only spend money above this share of its price. */
const SAVE_FOR_GLIDER = 0.6;
/**
 * A 5-run study can show no cup wins at all; a decent player still wins within a few tries,
 * so each attempt counts at least this much toward a win.
 */
const MIN_CUP_WIN_SHARE = 1 / 3;
/** Upgrade order at equal level: what a player buys first (performance before protection). */
const PREFERENCE = ['engine', 'thrusters', 'steering', 'tank', 'armor'];

interface Machine {
  owned: string[];
  selected: string;
  levels: Record<string, UpgradeLevels>;
}

const gliders = [...RACERS].sort((a, b) => a.price - b.price);
const starter = gliders[0];

function label(m: Machine): string {
  const l = m.levels[m.selected];
  return `${racerById(m.selected).name} ${UPGRADES.map((u) => `${u.id[0].toUpperCase()}${l[u.id]}`).join(' ')}`;
}

function fullSetCost(racerId: string): number {
  const r = racerById(racerId);
  let total = 0;
  for (const u of UPGRADES) for (let lvl = 0; lvl < MAX_UPGRADE_LEVEL; lvl++) total += upgradeCost(r, u.id, lvl);
  return total;
}

/** Buys the next glider worth having when affordable, then upgrades level by level, in preference order, above the savings. */
function shop(m: Machine, credits: number, log: string[]): number {
  const current = racerById(m.selected).price;
  const next = gliders.find((g) => !m.owned.includes(g.id) && g.price >= Math.max(1, current * GLIDER_STEP));
  if (next && credits >= next.price) {
    credits -= next.price;
    m.owned.push(next.id);
    m.levels[next.id] = noUpgrades();
    m.selected = next.id;
    log.push(`${next.name} (${next.price})`);
  }
  const reserve = next && !m.owned.includes(next.id) ? next.price * SAVE_FOR_GLIDER : 0;
  const racer = racerById(m.selected);
  for (;;) {
    const lv = m.levels[m.selected];
    const options = UPGRADES.filter((u) => lv[u.id] < MAX_UPGRADE_LEVEL).map((u) => ({ u, cost: upgradeCost(racer, u.id, lv[u.id]) }));
    options.sort((a, b) => lv[a.u.id] - lv[b.u.id] || PREFERENCE.indexOf(a.u.id) - PREFERENCE.indexOf(b.u.id));
    const pick = options[0];
    if (!pick || credits - pick.cost < reserve) return credits;
    credits -= pick.cost;
    lv[pick.u.id] += 1;
    log.push(`${pick.u.id} ${lv[pick.u.id]} (${pick.cost})`);
  }
}

function expectedRacePay(cup: CupDef, placeShare: number[]): number {
  return placeShare.reduce((sum, share, i) => {
    const pay = racePayout({ mode: 'championship', place: i + 1, cup, laps: 1, standardLaps: 1, cupWin: null }).total;
    return sum + share * pay;
  }, 0);
}

const machine: Machine = { owned: [starter.id], selected: starter.id, levels: { [starter.id]: noUpgrades() } };
let credits = 0;
let races = 0;
let earned = 0;
const milestones = new Map<string, number>();
const starterSet = fullSetCost(starter.id);

console.log(`Full upgrade set: ${gliders.map((g) => `${g.name} ${fullSetCost(g.id)}`).join(', ')}`);
console.log(`Glider prices: ${gliders.map((g) => `${g.name} ${g.price}`).join(', ')}\n`);

for (const world of WORLDS) {
  for (const cupId of world.cupIds) {
    const cup = cupById(cupId);
    const a = ASSUMED[cup.tier];
    if (!a) throw new Error(`sim-economy: no assumed machine for tier ${cup.tier}`);
    const study = studyCup(cup, DECENT, a.racerId, { ...noUpgrades(), ...a.levels });
    const perRace = expectedRacePay(cup, study.placeShare);
    const bonus = racePayout({ mode: 'championship', place: 1, cup, laps: 1, standardLaps: 1, cupWin: { firstTime: true } }).cupBonus;
    console.log(
      `${world.name} / ${cup.name} (tier ${cup.tier}): ~${Math.round(perRace)} per race, win bonus ${bonus}, ` +
        `cup-win rate ${(study.cupWinShare * 100).toFixed(0)}% (study on ${a.label})`,
    );
    let wins = 0;
    for (let attempt = 1; ; attempt++) {
      const log: string[] = [];
      credits = shop(machine, credits, log);
      console.log(`  attempt ${attempt} after ${races} races (earned ${earned}): ${credits} credits, ${label(machine)}${log.length ? `; bought ${log.join(', ')}` : ''}`);
      for (const g of machine.owned) if (g !== starter.id && !milestones.has(`glider:${g}`)) milestones.set(`glider:${g}`, races);
      const pay = Math.round(perRace * cup.trackIds.length);
      races += cup.trackIds.length;
      wins += Math.max(study.cupWinShare, MIN_CUP_WIN_SHARE);
      const won = wins >= 1;
      const gain = pay + (won ? bonus : 0);
      credits += gain;
      earned += gain;
      if (!milestones.has('starterSet') && earned >= starterSet) milestones.set('starterSet', races);
      if (won) break;
    }
  }
}
// The policy shops at the start of each attempt; a last visit catches purchases after the final cup.
credits = shop(machine, credits, []);
for (const g of machine.owned) if (g !== starter.id && !milestones.has(`glider:${g}`)) milestones.set(`glider:${g}`, races);

console.log(`\nAfter every world (${races} races, ${earned} earned): ${credits} credits, owns ${machine.owned.map((g) => racerById(g).name).join(', ')}; ${label(machine)}`);
const at = (k: string) => (milestones.has(k) ? `${milestones.get(k)} races` : 'not within these worlds');
console.log(`Glider #2 (${gliders[1].name}): ${at(`glider:${gliders[1].id}`)}`);
for (const g of gliders.slice(2)) console.log(`${g.name}: ${at(`glider:${g.id}`)}`);
console.log(`Earnings covering a full starter upgrade set (${starterSet}): ${at('starterSet')}`);
