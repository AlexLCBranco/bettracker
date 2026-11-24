// Dutching: split a total stake across selections so each one returns (as near as rounding allows) the same amount.
// Ideal return R = total / Σ(1/odds); stake on each = R / odds. Stakes are rounded to `step` (R$ 0,01 or R$ 1) and
// always add up to the total exactly: leftover units go one at a time to whichever selection returns least.

export interface DutchResult {
  stakes: number[];
  /** stake × odds per selection, after rounding. */
  returns: number[];
  minReturn: number;
  maxReturn: number;
  /** Profit if the worst-paying selection wins (negative = a loss whichever wins). */
  minProfit: number;
  maxProfit: number;
  /** Σ(1/odds): over 1 means the selections can't all be covered at a profit. */
  book: number;
  /** The single odds the whole dutch behaves like: 1 / book (before rounding). */
  combinedOdds: number;
}

export type DutchError = 'stake' | 'too-few' | 'odds';

export function dutch(total: number, odds: number[], step = 0.01): DutchResult | { error: DutchError } {
  if (!(total > 0) || !Number.isFinite(total)) return { error: 'stake' };
  if (odds.length < 2) return { error: 'too-few' };
  if (odds.some((o) => !(o > 1) || !Number.isFinite(o))) return { error: 'odds' };

  const book = odds.reduce((s, o) => s + 1 / o, 0);
  const unitsPerReal = Math.round(1 / step); // 100 for centavos, 1 for whole reais
  const totalUnits = Math.round(total * unitsPerReal);
  // floor of each ideal stake, in units
  const units = odds.map((o) => Math.floor(totalUnits / (o * book) + 1e-9));
  let left = totalUnits - units.reduce((a, b) => a + b, 0);
  while (left > 0) {
    let i = 0;
    for (let j = 1; j < odds.length; j++) if (units[j]! * odds[j]! < units[i]! * odds[i]!) i = j;
    units[i]!++;
    left--;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const stakes = units.map((u) => r2(u / unitsPerReal));
  const returns = stakes.map((s, i) => r2(s * odds[i]!));
  const spent = r2(totalUnits / unitsPerReal);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  return {
    stakes,
    returns,
    minReturn,
    maxReturn,
    minProfit: r2(minReturn - spent),
    maxProfit: r2(maxReturn - spent),
    book,
    combinedOdds: 1 / book,
  };
}

// ---- "If this many win" (BT-7) ----
// Selections can win together (player props), so the summary shows every count from 0 to all. Returns for k wins
// range from the k lowest returns to the k highest; profit = returns − total stake, ROI = profit / total stake.

export interface OutcomeRow {
  /** Number of selections that win; 'shared' = a shared leg loses, so every selection loses. */
  wins: number | 'shared';
  minReturn: number;
  maxReturn: number;
  minProfit: number;
  maxProfit: number;
  minRoi: number;
  maxRoi: number;
  /** The first row whose profit is above 0 whichever selections win. */
  breakEven: boolean;
}

export function outcomeTable(total: number, stakes: number[], odds: number[], hasShared = false): OutcomeRow[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const returns = stakes.map((s, i) => r2(s * odds[i]!)).sort((a, b) => a - b);
  const row = (wins: OutcomeRow['wins'], lo: number, hi: number): OutcomeRow => {
    const minProfit = r2(lo - total);
    const maxProfit = r2(hi - total);
    return { wins, minReturn: lo, maxReturn: hi, minProfit, maxProfit, minRoi: minProfit / total, maxRoi: maxProfit / total, breakEven: false };
  };
  const rows: OutcomeRow[] = hasShared ? [row('shared', 0, 0)] : [];
  for (let k = 0; k <= returns.length; k++) {
    const lo = r2(returns.slice(0, k).reduce((a, b) => a + b, 0));
    const hi = r2(returns.slice(returns.length - k).reduce((a, b) => a + b, 0));
    rows.push(row(k, k === 0 ? 0 : lo, k === 0 ? 0 : hi));
  }
  const first = rows.find((r) => r.minProfit > 0);
  if (first) first.breakEven = true;
  return rows;
}

// ---- Target odds (BT-40) ----
// Equal-return dutch: 1/combined = Σ 1/odds. Knowing every split but one and the combined odds wanted, the missing
// split needs 1 / (1/target − Σ 1/known). Stake share of a split = target / its odds.

export type TargetSolve =
  | { ok: true; needed: number; known: number[]; target: number }
  /** The known splits alone cap the combined odds at `limit`: anything below it works. (A target above 1 never
   *  needs odds of 1 or less on the missing split: 1/target − Σ is then below 1.) */
  | { ok: false; error: 'too-high'; limit: number }
  | { ok: false; error: 'target' | 'known' };

export function solveTarget(known: number[], target: number): TargetSolve {
  if (!(target > 1) || !Number.isFinite(target)) return { ok: false, error: 'target' };
  if (!known.length || known.some((o) => !(o > 1) || !Number.isFinite(o))) return { ok: false, error: 'known' };
  const book = known.reduce((s, o) => s + 1 / o, 0);
  const rest = 1 / target - book;
  if (!(rest > 1e-12)) return { ok: false, error: 'too-high', limit: 1 / book };
  return { ok: true, needed: 1 / rest, known, target };
}

/** Decimal odds as American: 3.80 → "+280", 1.50 → "-200", 2.00 → "+100". Rounded to whole points. */
export function formatAmerican(decimal: number): string {
  if (!(decimal > 1) || !Number.isFinite(decimal)) return '';
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return `-${Math.round(100 / (decimal - 1))}`;
}

/** The single odds a set of splits behaves like as an equal-return dutch: 1 / Σ(1/odds). */
export const combinedOdds = (odds: number[]): number => 1 / odds.reduce((s, o) => s + 1 / o, 0);
