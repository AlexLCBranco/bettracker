// Analytics page: performance broken down by one dimension at a time, and how combinations lose.
// Pending bets count towards "bets" and "wagered"; profit, ROI and win rate use settled bets only (as on the Dashboard).
// Money is bet by bet; counts (bets, pending, wins, losses) take a dutch as one bet (src/lib/dutch.ts).
import { normalize } from './autocomplete';
import { countBets } from './dutch';
import { profit, realStake } from './money';
import { collapseRollovers } from './rollover';
import type { Bet, Leg, Result } from './types';

export const DIMENSIONS = ['sport', 'book', 'market', 'odds', 'type', 'situation'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  sport: 'Sport',
  book: 'Book',
  market: 'Market',
  odds: 'Odds range',
  type: 'Type',
  situation: 'Situation',
};

export const NOT_SET = 'Not set';
export const MIXED = 'Mixed';

/** Total-odds buckets, lowest first. `max` is exclusive. */
export const ODDS_RANGES = [
  { label: '1.01–1.49', max: 1.5 },
  { label: '1.50–1.99', max: 2 },
  { label: '2.00–2.99', max: 3 },
  { label: '3.00–4.99', max: 5 },
  { label: '5.00+', max: Infinity },
] as const;

export function oddsRange(odds: number): string {
  return ODDS_RANGES.find((r) => odds < r.max)!.label;
}

export interface Row {
  /** Grouping key (case- and accent-insensitive for text dimensions). */
  key: string;
  label: string;
  bets: number;
  pending: number;
  wagered: number;
  settledStake: number;
  profit: number;
  /** profit / settled stake; null with no settled stake. */
  roi: number | null;
  wins: number;
  losses: number;
  /** wins / (wins + losses); null when there are none. */
  winRate: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A bet's sport or market: its legs' single value, "Mixed" when they differ, "Not set" when none is entered. */
function legValue(b: Bet, k: 'sport' | 'market'): { key: string; label: string } {
  const seen = new Map<string, string>();
  for (const l of b.legs) {
    const v = l[k].trim();
    if (v && !seen.has(normalize(v))) seen.set(normalize(v), v);
  }
  if (seen.size === 0) return { key: '\u0000not-set', label: NOT_SET };
  if (seen.size > 1) return { key: '\u0000mixed', label: MIXED };
  const [[key, label]] = [...seen];
  return { key, label };
}

function groupOf(b: Bet, d: Dimension): { key: string; label: string } {
  switch (d) {
    case 'sport':
    case 'market':
      return legValue(b, d);
    case 'book': {
      const v = b.book.trim();
      return v ? { key: normalize(v), label: v } : { key: '\u0000not-set', label: NOT_SET };
    }
    case 'odds': {
      const label = oddsRange(b.odds);
      return { key: label, label };
    }
    case 'type':
      if (b.dutchId) return { key: 'dutch', label: 'Dutch' };
      // BT-35: a ladder next to the rollover shots
      if (b.ladder) return { key: 'ladder', label: 'Ladder' };
      if (b.rolloverId) return { key: 'rollover', label: 'Rollover' };
      return { key: b.type, label: b.type === 'solo' ? 'Solo' : 'Combination' };
    case 'situation':
      return { key: b.situation, label: b.situation === 'pregame' ? 'Pregame' : 'Live' };
  }
}

/**
 * One row per group. Bets are expected newest first (as the app holds them), so a group's label is its
 * most recent spelling. Rows are sorted by number of bets, then label; odds ranges keep their natural order.
 */
export function breakdown(bets: Bet[], d: Dimension): Row[] {
  const rows = new Map<string, Row>();
  const members = new Map<string, Bet[]>();
  // BT-29: a rollover shot is one bet, grouped by its first bet (book, situation) and its legs, at its total odds
  for (const b of collapseRollovers(bets)) {
    const g = groupOf(b, d);
    let r = rows.get(g.key);
    if (!r) {
      r = { key: g.key, label: g.label, bets: 0, pending: 0, wagered: 0, settledStake: 0, profit: 0, roi: null, wins: 0, losses: 0, winRate: null };
      rows.set(g.key, r);
      members.set(g.key, []);
    }
    members.get(g.key)!.push(b);
    r.wagered += realStake(b);
    if (b.result === 'pending') continue;
    r.settledStake += realStake(b);
    r.profit += profit(b);
  }
  // counts: a dutch is one bet within each row it has bets in (judged by those bets)
  const out = [...rows.values()].map((r) => {
    const c = countBets(members.get(r.key)!);
    return {
      ...r,
      bets: c.count,
      pending: c.pending,
      wins: c.wins,
      losses: c.losses,
      wagered: round2(r.wagered),
      settledStake: round2(r.settledStake),
      profit: round2(r.profit),
      roi: r.settledStake > 0 ? r.profit / r.settledStake : null,
      winRate: c.wins + c.losses > 0 ? c.wins / (c.wins + c.losses) : null,
    };
  });
  if (d === 'odds') {
    const order = ODDS_RANGES.map((r) => r.label as string);
    return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  return out.sort((a, b) => b.bets - a.bets || a.label.localeCompare(b.label));
}

const legLost = (r: Result) => r === 'lost' || r === 'half-lost';
const legWon = (r: Result) => r === 'won' || r === 'half-won';

export interface LegRecord {
  key: string;
  label: string;
  won: number;
  lost: number;
  /** won / (won + lost); null when there are none. */
  winRate: number | null;
}

export interface ComboReport {
  /** Settled combinations that have their legs entered. */
  settled: number;
  won: number;
  lost: number;
  /** Lost combinations where exactly one leg lost. */
  lostByOne: number;
  /** Stake of those. */
  lostByOneStake: number;
  /** Lost combinations whose legs have no lost leg marked (results not entered). */
  lostUnknown: number;
  /** Leg results inside combinations, by market, most lost legs first. */
  legsByMarket: LegRecord[];
  /** The lost-by-one-leg combinations with the leg that lost, newest first. */
  oneLegAway: { bet: Bet; leg: Leg }[];
}

/** How combinations with legs ended, and which legs cost them. */
export function comboReport(bets: Bet[]): ComboReport {
  const rep: ComboReport = { settled: 0, won: 0, lost: 0, lostByOne: 0, lostByOneStake: 0, lostUnknown: 0, legsByMarket: [], oneLegAway: [] };
  const markets = new Map<string, LegRecord>();
  for (const b of bets) {
    if (b.type !== 'combination' || b.legs.length === 0 || b.result === 'pending') continue;
    rep.settled++;
    if (b.result === 'won') rep.won++;
    if (b.result === 'lost') {
      rep.lost++;
      const lostLegs = b.legs.filter((l) => legLost(l.result));
      if (lostLegs.length === 1) {
        rep.lostByOne++;
        rep.lostByOneStake += b.stake;
        rep.oneLegAway.push({ bet: b, leg: lostLegs[0]! });
      } else if (lostLegs.length === 0) rep.lostUnknown++;
    }
    for (const l of b.legs) {
      if (!legWon(l.result) && !legLost(l.result)) continue;
      const v = l.market.trim();
      const key = v ? normalize(v) : '\u0000not-set';
      let m = markets.get(key);
      if (!m) {
        m = { key, label: v || NOT_SET, won: 0, lost: 0, winRate: null };
        markets.set(key, m);
      }
      if (legWon(l.result)) m.won++;
      else m.lost++;
    }
  }
  rep.lostByOneStake = round2(rep.lostByOneStake);
  rep.legsByMarket = [...markets.values()]
    .map((m) => ({ ...m, winRate: m.won + m.lost > 0 ? m.won / (m.won + m.lost) : null }))
    .sort((a, b) => b.lost - a.lost || b.won + b.lost - (a.won + a.lost) || a.label.localeCompare(b.label));
  return rep;
}
