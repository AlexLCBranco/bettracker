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
