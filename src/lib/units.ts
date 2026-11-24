// BT-38: units. A stake can be typed as money ("100") or as units ("1u", "0,5u", "H$2u"); each money type has a fixed
// unit size set on the Bankroll page. A bet keeps its stake in money plus the unit size in force when it was placed,
// so changing the unit size later never rewrites old bets. The units view shows stakes and profit as "1u", "+0,45u".

import { MONEY, type Bet, type Money } from './types';

export type UnitSizes = Record<Money, number | null>;
export const NO_UNITS: UnitSizes = { real: null, bonus: null, hypothetical: null };

export interface UnitSettings {
  unitSizes: UnitSizes;
  /** Money types whose "apply to older bets" offer was already made (answered either way). */
  offered: Money[];
}

const PREFIX: Record<string, Money> = { R: 'real', B: 'bonus', H: 'hypothetical' };
const SYMBOL: Record<Money, string> = { real: 'R$', bonus: 'B$', hypothetical: 'H$' };

export interface StakeText {
  /** The number typed (money, or units when `units`). */
  value: number;
  units: boolean;
  /** The money type a prefix picked ("H$"), if any. */
  money?: Money;
}

/** "150", "150,5", "R$ 150", "1u", "0,5u", "2.5U", "H$1u". Null for anything else ("25 pts", "u", "1uu"). */
export function parseStakeText(text: string): StakeText | null {
  const m = /^(?:([RHB])\$\s*)?(\d+(?:[.,]\d+)?|[.,]\d+)\s*(u)?$/i.exec(text.trim());
  if (!m) return null;
  const value = Number(m[2]!.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { value, units: !!m[3], ...(m[1] ? { money: PREFIX[m[1].toUpperCase()]! } : {}) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Units typed → money with the unit size of that money type; an error when that type has no unit size. */
export function unitsToMoney(units: number, money: Money, sizes: UnitSizes): { ok: true; amount: number } | { ok: false; error: string } {
  const size = sizes[money];
  if (!size) return { ok: false, error: `No unit size for ${SYMBOL[money]}: set it on the Bankroll page` };
  return { ok: true, amount: round2(units * size) };
}

/**
 * A typed stake read with the unit sizes: money as typed, or units converted. `money` is the money type in use (a
 * prefix overrides it). Null when the text is no stake at all.
 */
export function readStake(text: string, money: Money, sizes: UnitSizes): ({ ok: true; amount: number; money: Money; units: number | null } | { ok: false; error: string; money: Money }) | null {
  const s = parseStakeText(text);
  if (!s) return null;
  const m = s.money ?? money;
  if (!s.units) return { ok: true, amount: s.value, money: m, units: null };
  const r = unitsToMoney(s.value, m, sizes);
  return r.ok ? { ok: true, amount: r.amount, money: m, units: s.value } : { ok: false, error: r.error, money: m };
}

/** "1u", "0,45u", "+0,45u", "-1u", "12,3u": up to 2 decimals, trailing zeros dropped, comma decimals. */
export function formatUnits(n: number, signed = false): string {
  const r = round2(n);
  const abs = Math.abs(r).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const sign = r < 0 ? '-' : signed && r > 0 ? '+' : '';
  return `${sign}${abs}u`;
}

/** An amount of a bet in units, by the unit size the bet was placed with; null when it has none. */
export const toUnits = (amount: number, unitSize: number | null | undefined): number | null => (unitSize && unitSize > 0 ? amount / unitSize : null);

/** The typing preview: "1,5u = H$ 150,00". */
export const previewText = (units: number, amount: number, money: Money, fmt: (n: number, m: Money) => string) => `${formatUnits(units)} = ${fmt(amount, money)}`;

/**
 * The bets as the units view counts them: every amount (stake, cash-out) divided by its bet's unit size, so the usual
 * money functions (profit, summarize, breakdown) give units. Null when any bet has no unit size or the bets mix money
 * types (units of different types are never added together): the caller then shows money.
 */
export function asUnitBets<T extends Pick<Bet, 'stake' | 'cashout' | 'unitSize' | 'money'>>(bets: T[]): T[] | null {
  if (!bets.length) return null;
  const money = bets[0]!.money;
  const out: T[] = [];
  for (const b of bets) {
    if (!b.unitSize || b.money !== money) return null;
    out.push({ ...b, stake: b.stake / b.unitSize, cashout: b.cashout == null ? null : b.cashout / b.unitSize });
  }
  return out;
}

/** Valid stored unit sizes (above 0, or null). */
export function readUnitSizes(raw: unknown): UnitSizes {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...NO_UNITS };
  for (const m of MONEY) {
    const v = o[m];
    out[m] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? round2(v) : null;
  }
  return out;
}
