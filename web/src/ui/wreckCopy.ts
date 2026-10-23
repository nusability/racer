// Player-facing words for a wreck: the HUD banner and the results headline say the same thing.
import type { WreckInfo } from '../game/types.ts';

export interface WreckCopy {
  title: string;
  sub: string;
}

export function wreckCopy(w: WreckInfo): WreckCopy {
  switch (w.reason) {
    case 'destroyed':
      return { title: 'WRECKED', sub: 'Hull destroyed' };
    case 'fell':
      return { title: 'FELL', sub: 'Missed the landing' };
    case 'offEdge':
      return { title: 'OFF THE EDGE', sub: 'Flew off the track' };
    case 'loopStall':
      return { title: 'STALLED IN THE LOOP', sub: 'Not enough speed to hold the loop' };
    case 'obstacle':
    case 'hazard':
      return w.cause ? { title: `HIT BY ${w.cause.toUpperCase()}`, sub: 'Wrecked' } : { title: 'WRECKED', sub: w.reason === 'hazard' ? 'Caught by a hazard' : 'Hit an obstacle' };
  }
}
