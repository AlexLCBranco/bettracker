// Betting Tool splits (BT-5): a split is a selection row, optionally with extra legs of its own, plus the shared legs
// that are part of every split. A split with 2+ legs in all is a combination: its odds are the total odds box, which
// is prefilled with the product of its legs ("estimated") until the user types the book's real price over it. This is
// the one place legs are ever multiplied, and only as an editable prefill.

import { parseOdds, type OddsFormat } from './money';

export interface LegText {
  id: number;
  name: string;
  odds: string;
  /** How to read the odds text; "auto" guesses. Missing in calculations saved before formats existed. */
  format?: OddsFormat;
}

export interface SplitText extends LegText {
  /** Extra legs of this split (the row's own name and odds are its first leg). Missing in older saved calculations. */
  legs?: LegText[];
  /** The total odds box as typed; undefined or blank = use the estimate. Read in any format. */
  total?: string;
}

export interface SplitLeg {
  name: string;
  /** Unrounded decimal odds; null when left blank (allowed only when the total is typed). */
  odds: number | null;
}

export interface SplitCalc {
  /** Anything typed in this split's odds, extra legs' odds or total: blank splits are left out of the maths. */
  used: boolean;
  /** 2+ legs in all (own + shared): logged as a combination, shows the total odds box. */
  combo: boolean;
  /** Own legs then shared legs (blank legs left out). */
  legs: SplitLeg[];
  /** Product of all legs' odds; null when any is blank or unreadable. */
  estimate: number | null;
  /** True when the odds come from the estimate, not a typed total. */
  estimated: boolean;
  /** Decimal odds the dutch maths uses; NaN when unreadable. */
  odds: number;
}

const typed = (l: LegText) => l.name.trim() !== '' || l.odds.trim() !== '';

/** Shared legs that count: anything typed in them. */
export const sharedUsed = (shared: LegText[] | undefined): LegText[] => (shared ?? []).filter(typed);

/** Whether the row shows the leg lines and total odds box (it has extra legs, or there are shared legs). */
export const showsLegs = (row: SplitText, shared: LegText[] | undefined): boolean => (row.legs?.length ?? 0) > 0 || (shared?.length ?? 0) > 0;

export function splitCalc(row: SplitText, shared: LegText[] | undefined): SplitCalc {
  const own = [row, ...(row.legs ?? []).filter(typed)];
  const all = [...own, ...sharedUsed(shared)];
  const combo = all.length >= 2;
  const totalText = (row.total ?? '').trim();

  if (!combo) {
    const p = parseOdds(row.odds, row.format ?? 'auto');
    return {
      used: row.odds.trim() !== '',
      combo,
      legs: [{ name: row.name.trim(), odds: p?.decimal ?? null }],
      estimate: p?.decimal ?? null,
      estimated: false,
      odds: p?.decimal ?? NaN,
    };
  }

  let bad = false;
  const legs = all.map((l): SplitLeg => {
    if (!l.odds.trim()) return { name: l.name.trim(), odds: null };
    const p = parseOdds(l.odds, l.format ?? 'auto');
    if (!p) bad = true;
    return { name: l.name.trim(), odds: p?.decimal ?? null };
  });
  const estimate = bad || legs.some((l) => l.odds == null) ? null : legs.reduce((s, l) => s * l.odds!, 1);
  const used = row.odds.trim() !== '' || totalText !== '' || own.slice(1).some((l) => l.odds.trim() !== '');
  if (totalText) {
    const t = parseOdds(totalText, 'auto');
    return {
      used,
      combo,
      legs,
      estimate,
      estimated: false,
      odds: bad || !t ? NaN : t.decimal,
    };
  }
  return {
    used,
    combo,
    legs,
    estimate,
    estimated: true,
    odds: estimate ?? NaN,
  };
}
