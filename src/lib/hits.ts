// Dutch hit count (BT-6): how many splits of a dutch hit ("1/2"), and the distinct legs that missed. A leg shared by
// every split that lost counts as ONE miss, however many splits it sank.

import { normalize } from './autocomplete';
import { betLabel, groupRows, sharedLegNames } from './dutch';
import { profit } from './money';
import type { Bet, Result } from './types';

export type SplitMark = 'hit' | 'miss' | 'void' | 'pending';

const legLost = (r: Result) => r === 'lost' || r === 'half-lost';

/** A split (one bet of a dutch): won / half-won hit, lost / half-lost miss; a cash-out by its profit's sign (even = void). */
export function splitMark(b: Bet): SplitMark {
  switch (b.result) {
    case 'pending':
      return 'pending';
    case 'won':
    case 'half-won':
      return 'hit';
    case 'lost':
    case 'half-lost':
      return 'miss';
    case 'void':
      return 'void';
    case 'cash-out': {
      const p = Math.round(profit(b) * 100);
      return p > 0 ? 'hit' : p < 0 ? 'miss' : 'void';
    }
  }
}

export interface Miss {
  /** The leg's selection, or (legNotSet) the split's name. */
  name: string;
  /** A leg every split has. */
  shared: boolean;
  /** A lost combination with no leg marked lost: counted as one miss of its own. */
  legNotSet: boolean;
}

export type HitTone = 'pending' | 'all' | 'some' | 'none' | 'void';

export interface DutchHits {
  /** Settled splits that hit. */
  hits: number;
  /** Settled splits, void left out. */
  splits: number;
  pending: number;
  /** Distinct missed legs (shared ones once), plus one per lost split without leg results. */
  misses: Miss[];
  tone: HitTone;
}

export function dutchHits(bets: Bet[]): DutchHits {
  const marks = bets.map(splitMark);
  const hits = marks.filter((m) => m === 'hit').length;
  const splits = marks.filter((m) => m === 'hit' || m === 'miss').length;
  const pending = marks.filter((m) => m === 'pending').length;
  const shared = new Set(sharedLegNames(bets).map(normalize));

  const misses = new Map<string, Miss>();
  bets.forEach((b, i) => {
    if (marks[i] !== 'miss') return;
    const lost = b.legs.filter((l) => legLost(l.result) && l.selection.trim());
    // a solo split's single leg mirrors the bet, so it is always "set"
    if (b.type === 'solo' && b.legs[0]) lost.splice(0, lost.length, b.legs[0]);
    if (!lost.length) {
      misses.set(`\u0000${b.id}`, { name: betLabel(b), shared: false, legNotSet: true });
      return;
    }
    for (const l of lost) {
      const key = normalize(l.selection) || `\u0000${b.id}`;
      if (!misses.has(key)) misses.set(key, { name: l.selection.trim() || betLabel(b), shared: shared.has(key), legNotSet: false });
    }
  });

  const tone: HitTone = pending ? 'pending' : splits === 0 ? 'void' : hits === splits ? 'all' : hits > 0 ? 'some' : 'none';
  return { hits, splits, pending, misses: [...misses.values()], tone };
}

/** "1/2", "1/2 · 1 pending". */
export const hitsText = (h: DutchHits) => `${h.hits}/${h.splits}${h.pending ? ` · ${h.pending} pending` : ''}`;

export const missesText = (h: DutchHits) => (h.misses.length ? `${h.misses.length} ${h.misses.length === 1 ? 'miss' : 'misses'}` : '');

/** Tooltip: the missed legs named, shared ones marked. */
export function missesTitle(h: DutchHits): string {
  const parts = h.misses.map((m) => (m.legNotSet ? `${m.name} (leg not set)` : m.shared ? `${m.name} (shared)` : m.name));
  return [`${hitsText(h)} hit`, parts.length ? `Missed: ${parts.join(', ')}` : ''].filter(Boolean).join(' · ');
}

export interface DutchHitReport {
  /** Fully settled dutches (not all void). */
  settled: number;
  allHit: number;
  someHit: number;
  noneHit: number;
  /** None-hit dutches whose only misses are shared legs. */
  sunkByShared: number;
}

export function dutchHitReport(bets: Bet[]): DutchHitReport {
  const r: DutchHitReport = { settled: 0, allHit: 0, someHit: 0, noneHit: 0, sunkByShared: 0 };
  for (const row of groupRows(bets)) {
    if (row.kind !== 'dutch') continue;
    const h = dutchHits(row.bets);
    if (h.tone === 'pending' || h.tone === 'void') continue;
    r.settled++;
    if (h.tone === 'all') r.allHit++;
    else if (h.tone === 'some') r.someHit++;
    else {
      r.noneHit++;
      if (h.misses.length && h.misses.every((m) => m.shared)) r.sunkByShared++;
    }
  }
  return r;
}

/**
 * A combination's legs as a hit count (BT-17), like a dutch's splits: "2/3" legs won, the lost legs as misses.
 * Null when it has fewer than 2 legs.
 */
export function comboHits(b: Bet): DutchHits | null {
  if (b.type !== 'combination' || b.legs.length < 2) return null;
  const won = (r: Result) => r === 'won' || r === 'half-won';
  const hits = b.legs.filter((l) => won(l.result)).length;
  const splits = b.legs.filter((l) => won(l.result) || legLost(l.result)).length;
  const pending = b.legs.filter((l) => l.result === 'pending').length;
  const misses = b.legs.filter((l) => legLost(l.result)).map((l) => ({ name: l.selection.trim() || l.game || 'leg', shared: false, legNotSet: false }));
  const tone: HitTone = pending ? 'pending' : splits === 0 ? 'void' : hits === splits ? 'all' : hits > 0 ? 'some' : 'none';
  return { hits, splits, pending, misses, tone };
}
