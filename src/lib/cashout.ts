// BT-34: the cash-out box reads either the money returned ("140", "140,50") or a percentage ("70%") of the bet's FULL
// PAYOUT (stake × odds). What is stored never changes: result `cash-out` and `cashout` = the amount returned. The
// percentage is derived for display only. (The percentage base, the full payout, is Claude's choice, not the owner's.)

import { formatMoney, parseNumber, potentialReturn, type MoneyScope } from './money';

export type CashoutMode = 'amount' | 'percent';

export interface CashoutRead {
  /** The money returned, rounded to cents: what is saved. */
  amount: number;
  /** The amount as a share of the full payout, in percent (70 = 70%). */
  percent: number;
  /** Stake × odds. */
  fullPayout: number;
  /** Amount − stake. */
  profit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The amount returned as a percentage of the full payout; null when the bet has no payout to compare with. */
export function cashoutPercent(amount: number, stake: number, odds: number): number | null {
  const full = potentialReturn(stake, odds);
  return full > 0 ? (amount / full) * 100 : null;
}

/**
 * Reads the box. A trailing "%" always means a percentage, whatever the toggle says; otherwise the toggle (R$ / %)
 * decides. Comma or dot decimals, "R$ 140" accepted. Null for empty or unreadable text, or a negative value.
 */
export function readCashout(text: string, mode: CashoutMode, stake: number, odds: number): CashoutRead | null {
  const t = text.trim();
  if (!t) return null;
  const isPct = t.endsWith('%') || mode === 'percent';
  const n = parseNumber(t.replace(/%$/, '').trim());
  if (n == null) return null;
  const fullPayout = potentialReturn(stake, odds);
  const amount = isPct ? round2((fullPayout * n) / 100) : round2(n);
  const percent = isPct ? n : fullPayout > 0 ? (amount / fullPayout) * 100 : 0;
  return { amount, percent, fullPayout, profit: round2(amount - stake) };
}

/** "70%", "70.5%", "33.33%": at most 2 decimals, no trailing zeros. */
export function formatPct(p: number): string {
  return `${String(Math.round(p * 100) / 100)}%`;
}

/** The line under the box: "R$ 140,00 returned · 70% of full payout (R$ 200,00)"; the profit is shown next to it. */
export function cashoutLine(r: CashoutRead, money: MoneyScope): string {
  return `${formatMoney(r.amount, money)} returned · ${formatPct(r.percent)} of full payout (${formatMoney(r.fullPayout, money)})`;
}

/** A cashed-out bet's result, both values: "Cash-out · R$ 140,00 (70%)". */
export function cashoutLabel(amount: number, stake: number, odds: number, money: MoneyScope): string {
  const p = cashoutPercent(amount, stake, odds);
  return `Cash-out · ${formatMoney(amount, money)}${p == null ? '' : ` (${formatPct(p)})`}`;
}
