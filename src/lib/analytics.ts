// Analytics page: performance broken down by one dimension at a time, and how combinations lose.
// Pending bets count towards "bets" and "wagered"; profit, ROI and win rate use settled bets only (as on the Dashboard).
// Money is bet by bet; counts (bets, pending, wins, losses) take a dutch as one bet (src/lib/dutch.ts).
import { normalize } from './autocomplete';
import { countBets } from './dutch';
import { profit, realStake } from './money';
import { collapseRollovers, TIERS, tierOf } from './rollover';
import type { Bet, Leg, Result } from './types';

export const DIMENSIONS = ['sport', 'book', 'market', 'odds', 'type', 'situation'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  sport: 'Sport',
  book: 'Book',
  market: 'Market',
  odds: 'Odds',
  type: 'Type',
  situation: 'Situation',
};

export const NOT_SET = 'Not set';
export const MIXED = 'Mixed';

/**
 * Total-odds buckets, lowest first. `max` is exclusive. BT-61: the main breakdown uses the shot bands below instead;
 * these stay for the dutch "By combined odds" table (BT-41).
 */
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

// BT-61: the Odds breakdown by the owner's bands (mini, semi, Pepsi, shot), taken from the rollover tiers (one source:
// a rename or a new minimum there shows here), plus "Below mini". Shot is split into finer sub-rows.
const odds2 = (n: number) => n.toFixed(2);
const BELOW = 'Below mini';

/** The bands lowest first, each with its label ("Semi 1.33–1.50"). */
export const ODDS_BANDS: { key: string; label: string }[] = [
  { key: BELOW, label: `${BELOW} under ${odds2(TIERS[0].min)}` },
  ...TIERS.map((t, i) => {
    const next = TIERS[i + 1];
    return { key: t.name as string, label: `${t.name} ${odds2(t.min)}${next ? `–${odds2(next.min - 0.01)}` : '+'}` };
  }),
];

/** The band odds fall in (judged at 2 decimals, as the tiers are). */
export function oddsBand(odds: number): { key: string; label: string } {
  const t = tierOf(odds) ?? BELOW;
  return ODDS_BANDS.find((b) => b.key === t)!;
}

const TOP = TIERS[TIERS.length - 1]!;
/** The top band (Shot) split finer, so a 1.85 and a 6.0 are not read as the same thing. */
export const SHOT_SUBS = [TOP.min, 2, 3, 5].map((min, i, all) => {
  const next = all[i + 1];
  return { min, label: next ? `${odds2(min)}–${odds2(next - 0.01)}` : `${odds2(min)}+` };
});

export function shotSub(odds: number): { key: string; label: string } {
  const o = Math.round(odds * 100) / 100;
  let sub = SHOT_SUBS[0]!;
  for (const x of SHOT_SUBS) if (o >= x.min) sub = x;
  return { key: `${TOP.name}:${sub.label}`, label: sub.label };
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
  /** BT-61: a sub-row (Shot's finer ranges): its parent row's key. Sub-rows sort with their parent. */
  parent?: string;
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
    case 'odds':
      return oddsBand(b.odds);
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

/** One row per group of (already collapsed) bets. */
function aggregate(collapsed: Bet[], keyOf: (b: Bet) => { key: string; label: string }): Row[] {
  const rows = new Map<string, Row>();
  const members = new Map<string, Bet[]>();
  for (const b of collapsed) {
    const g = keyOf(b);
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
  return [...rows.values()].map((r) => {
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
}

/**
 * One row per group. Bets are expected newest first (as the app holds them), so a group's label is its
 * most recent spelling. Rows are sorted by number of bets, then label; odds bands keep their natural order, with
 * Shot's sub-rows right after it.
 */
export function breakdown(bets: Bet[], d: Dimension): Row[] {
  // BT-29: a rollover shot is one bet, grouped by its first bet (book, situation) and its legs, at its total odds
  const collapsed = collapseRollovers(bets);
  if (d === 'odds') {
    const order = ODDS_BANDS.map((x) => x.key);
    const subOrder = SHOT_SUBS.map((x) => `${TOP.name}:${x.label}`);
    const out: Row[] = [];
    for (const row of aggregate(collapsed, (b) => oddsBand(b.odds)).sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key))) {
      out.push(row);
      if (row.key !== TOP.name) continue;
      const subs = aggregate(
        collapsed.filter((b) => oddsBand(b.odds).key === TOP.name),
        (b) => shotSub(b.odds),
      ).sort((x, y) => subOrder.indexOf(x.key) - subOrder.indexOf(y.key));
      out.push(...subs.map((x) => ({ ...x, parent: row.key })));
    }
    return out;
  }
  return aggregate(collapsed, (b) => groupOf(b, d)).sort((x, y) => y.bets - x.bets || x.label.localeCompare(y.label));
}

export type SortKey = 'natural' | 'bets' | 'wagered' | 'profit' | 'roi' | 'winRate';

/** Rows sorted by a column (missing ROI / win rate last); sub-rows stay under their parent, in their own order. */
export function sortRows(rows: Row[], sort: SortKey): Row[] {
  if (sort === 'natural') return rows;
  const top = rows.filter((r) => !r.parent).sort((x, y) => (y[sort] ?? -Infinity) - (x[sort] ?? -Infinity));
  return top.flatMap((r) => [r, ...rows.filter((x) => x.parent === r.key)]);
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
