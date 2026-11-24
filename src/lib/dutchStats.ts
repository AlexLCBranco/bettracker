// Dutch split stats (BT-41): how dutches do as a whole and which of their splits hit. A dutch is ONE bet in counts
// (win when its net profit is above 0, loss below 0); money stays bet by bet. A split banked into a rollover shot
// counts with the shot's result in money (as everywhere else), but by its own odds and hit in the split figures.

import { ODDS_RANGES, oddsRange, type Row } from './analytics';
import { groupOutcome, groupRows } from './dutch';
import { splitMark } from './hits';
import { profit, realStake } from './money';
import { chainAsBet, chainsOf } from './rollover';
import type { Bet } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1 / Σ(1/odds) of the splits (a combination split by its total odds, which is its `odds`). */
export const dutchCombinedOdds = (splits: Pick<Bet, 'odds'>[]): number => 1 / splits.reduce((s, b) => s + 1 / b.odds, 0);

export type SplitPosition = 'lowest' | 'middle' | 'highest';
export const POSITION_LABEL: Record<SplitPosition, string> = { lowest: 'Lowest-odds split', middle: 'Middle splits', highest: 'Highest-odds split' };

/**
 * Each split's position by odds inside its dutch. Splits with equal odds share the lower position they span: [2, 2]
 * are both lowest, [2, 3, 3] is lowest, middle, middle. A two-split dutch has no middle.
 */
export function splitPositions(odds: number[]): SplitPosition[] {
  const sorted = [...odds].sort((a, b) => a - b);
  const n = sorted.length;
  return odds.map((o) => {
    const first = sorted.indexOf(o);
    return first === 0 ? 'lowest' : first === n - 1 ? 'highest' : 'middle';
  });
}

export interface PositionRow {
  key: SplitPosition;
  label: string;
  /** Settled splits in this position (void left out). */
  splits: number;
  hit: number;
  hitRate: number | null;
  averageOdds: number | null;
  /** Net profit of the dutches where a split in this position hit (each dutch once). */
  profitWhenHit: number;
}

export interface DutchStats {
  /** Settled dutches (none pending). */
  settled: number;
  pending: number;
  wagered: number;
  profit: number;
  roi: number | null;
  wins: number;
  losses: number;
  winRate: number | null;
  averageOdds: number | null;
  splitHits: number;
  splitMisses: number;
  splitHitRate: number | null;
  positions: PositionRow[];
  /** 2, 3, 4+ splits; pending dutches count in bets and wagered, as in the page's breakdown table. */
  bySplits: Row[];
  byOdds: Row[];
}

interface Dutch {
  splits: Bet[];
  /** The splits as money counts them: a banked split as its whole shot. */
  money: Bet[];
  outcome: ReturnType<typeof groupOutcome>;
  odds: number;
}

function emptyRow(key: string, label: string): Row & { _settled: number } {
  return { key, label, bets: 0, pending: 0, wagered: 0, settledStake: 0, profit: 0, roi: null, wins: 0, losses: 0, winRate: null, _settled: 0 };
}

function addTo(r: Row, d: Dutch) {
  r.bets++;
  const stake = d.money.reduce((s, b) => s + realStake(b), 0);
  r.wagered += stake;
  if (d.outcome === 'pending') {
    r.pending++;
    return;
  }
  r.settledStake += stake;
  r.profit += d.money.reduce((s, b) => s + profit(b), 0);
  if (d.outcome === 'won') r.wins++;
  if (d.outcome === 'lost') r.losses++;
}

function finish(r: Row): Row {
  const { key, label, bets, pending, wins, losses } = r;
  return {
    key,
    label,
    bets,
    pending,
    wins,
    losses,
    wagered: round2(r.wagered),
    settledStake: round2(r.settledStake),
    profit: round2(r.profit),
    roi: r.settledStake > 0 ? r.profit / r.settledStake : null,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
  };
}

export function dutchStats(bets: Bet[]): DutchStats {
  const chains = chainsOf(bets);
  const dutches: Dutch[] = [];
  for (const row of groupRows(bets)) {
    if (row.kind !== 'dutch') continue;
    const money = row.bets.map((b) => (b.rolloverId && chains.get(b.rolloverId) ? chainAsBet(chains.get(b.rolloverId)!, bets) : b));
    dutches.push({ splits: row.bets, money, outcome: groupOutcome(money), odds: dutchCombinedOdds(row.bets) });
  }

  const all = emptyRow('all', 'All');
  const settled = dutches.filter((d) => d.outcome !== 'pending');
  for (const d of settled) addTo(all, d);
  const total = finish(all);

  let splitHits = 0;
  let splitMisses = 0;
  const pos = new Map<SplitPosition, { splits: number; hit: number; oddsSum: number; profit: number }>();
  for (const d of settled) {
    const marks = d.splits.map(splitMark);
    const places = splitPositions(d.splits.map((b) => b.odds));
    const net = d.money.reduce((s, b) => s + profit(b), 0);
    const hitIn = new Set<SplitPosition>();
    d.splits.forEach((b, i) => {
      const m = marks[i];
      if (m !== 'hit' && m !== 'miss') return;
      if (m === 'hit') splitHits++;
      else splitMisses++;
      const p = places[i]!;
      const r = pos.get(p) ?? { splits: 0, hit: 0, oddsSum: 0, profit: 0 };
      r.splits++;
      r.oddsSum += b.odds;
      if (m === 'hit') {
        r.hit++;
        hitIn.add(p);
      }
      pos.set(p, r);
    });
    for (const p of hitIn) pos.get(p)!.profit += net;
  }
  const positions: PositionRow[] = (['lowest', 'middle', 'highest'] as const)
    .filter((k) => pos.has(k))
    .map((k) => {
      const r = pos.get(k)!;
      return { key: k, label: POSITION_LABEL[k], splits: r.splits, hit: r.hit, hitRate: r.splits ? r.hit / r.splits : null, averageOdds: r.splits ? r.oddsSum / r.splits : null, profitWhenHit: round2(r.profit) };
    });

  const sizes = new Map<string, Row>();
  const ranges = new Map<string, Row>();
  for (const d of dutches) {
    const n = d.splits.length;
    const sk = n >= 4 ? '4+' : String(n);
    if (!sizes.has(sk)) sizes.set(sk, emptyRow(sk, `${sk} splits`));
    addTo(sizes.get(sk)!, d);
    const ok = oddsRange(d.odds);
    if (!ranges.has(ok)) ranges.set(ok, emptyRow(ok, ok));
    addTo(ranges.get(ok)!, d);
  }
  const sizeOrder = ['2', '3', '4+'];
  const oddsOrder = ODDS_RANGES.map((r) => r.label as string);

  return {
    settled: settled.length,
    pending: dutches.length - settled.length,
    wagered: total.settledStake,
    profit: total.profit,
    roi: total.roi,
    wins: total.wins,
    losses: total.losses,
    winRate: total.winRate,
    averageOdds: settled.length ? settled.reduce((s, d) => s + d.odds, 0) / settled.length : null,
    splitHits,
    splitMisses,
    splitHitRate: splitHits + splitMisses ? splitHits / (splitHits + splitMisses) : null,
    positions,
    bySplits: [...sizes.values()].map(finish).sort((a, b) => sizeOrder.indexOf(a.key) - sizeOrder.indexOf(b.key)),
    byOdds: [...ranges.values()].map(finish).sort((a, b) => oddsOrder.indexOf(a.key) - oddsOrder.indexOf(b.key)),
  };
}
