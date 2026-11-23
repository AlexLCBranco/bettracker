import type { Bet, Money, Result } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Profit of a settled bet (0 for pending). */
export function profitOf(stake: number, odds: number, result: Result, cashout: number | null): number {
  switch (result) {
    case 'won':
      return round2(stake * (odds - 1));
    case 'lost':
      return round2(-stake);
    case 'void':
    case 'pending':
      return 0;
    case 'cash-out':
      return round2((cashout ?? 0) - stake);
    case 'half-won':
      return round2((stake / 2) * (odds - 1));
    case 'half-lost':
      return round2(-stake / 2);
  }
}

export const profit = (b: Pick<Bet, 'stake' | 'odds' | 'result' | 'cashout'>) => profitOf(b.stake, b.odds, b.result, b.cashout);

/** Stake × odds: what a winning bet pays back in total. */
export const potentialReturn = (stake: number, odds: number) => (stake > 0 && odds > 0 ? round2(stake * odds) : 0);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** What totals are shown in (BT-14): one kind of money, or both added up. */
export type MoneyScope = Money | 'both';
export const MONEY_SYMBOL: Record<MoneyScope, string> = { real: 'R$', hypothetical: 'H$', both: 'R$+H$' };

/** Like formatBRL, in the bet's money: "H$ 50,00" for hypothetical dollars, "R$+H$ 50,00" for both added up. */
export function formatMoney(n: number, money: MoneyScope = 'real', signed = false): string {
  const s = formatBRL(n, signed);
  return money === 'real' ? s : s.replace('R$', () => MONEY_SYMBOL[money]);
}

/** "R$ 1.234,50"; with sign, "+R$ 10,00" / "-R$ 10,00". */
export function formatBRL(n: number, signed = false): string {
  const s = brl.format(Math.abs(n)).replace(/ /g, ' ');
  if (!signed) return n < 0 ? `-${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

/**
 * Odds as shown: 2 decimals, more (up to 4) when the stored odds have them, so the odds shown match the payout
 * (BT-20: 1.9924 pays +99,24 on 100, so it is not shown as 1.99). `decimals` caps it (combined odds: 2).
 */
export const formatOdds = (n: number | null | undefined, decimals = 4) => {
  if (n == null || !Number.isFinite(n)) return '';
  const s = n.toFixed(Math.max(2, decimals));
  return s.replace(/(\.\d\d\d*?)0+$/, '$1');
};

/** Parses "150", "2.10", "2,10", "R$ 150". Returns null for anything else. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/i, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Odds formats (Betting Tool only). Every format converts to decimal odds; bets store decimal odds only.

export const ODDS_FORMATS = ['auto', 'decimal', 'american', 'fractional', 'hongkong', 'indonesian', 'malay', 'probability'] as const;
export type OddsFormat = (typeof ODDS_FORMATS)[number];

export const ODDS_FORMAT_LABEL: Record<OddsFormat, string> = {
  auto: 'Auto',
  decimal: 'Decimal',
  american: 'American',
  fractional: 'Fractional',
  hongkong: 'Hong Kong',
  indonesian: 'Indonesian',
  malay: 'Malay',
  probability: 'Probability %',
};

export interface ParsedOdds {
  /** Unrounded decimal odds, always above 1. */
  decimal: number;
  /** The format it was read as, for display ("American", "Indonesian / Malay", ...). */
  label: string;
  /** True when the text was already plain decimal odds (nothing to show next to the box). */
  plain: boolean;
}

const NUM = /^\d+(\.\d+)?$|^\.\d+$/;
const toNum = (t: string): number | null => (NUM.test(t) ? Number(t) : null);

/** "+220" → { sign: 1, abs: 220, signed: true }. Comma or dot decimals; spaces ignored. */
function signed(t: string): { sign: 1 | -1; abs: number; explicit: boolean } | null {
  const m = /^([+-]?)(.*)$/.exec(t)!;
  const abs = toNum(m[2]!);
  if (abs == null) return null;
  return { sign: m[1] === '-' ? -1 : 1, abs, explicit: m[1] !== '' };
}

const american = (sign: 1 | -1, abs: number) => (sign > 0 ? 1 + abs / 100 : 1 + 100 / abs);
/** Indonesian and Malay share one rule: positive x = 1 + x, negative x = 1 + 1/|x|. */
const indoMalay = (sign: 1 | -1, abs: number) => (sign > 0 ? 1 + abs : 1 + 1 / abs);

function fractional(t: string): number | null {
  const parts = t.split('/');
  if (parts.length === 1) {
    const n = toNum(t);
    return n == null ? null : 1 + n; // "2" as 2/1
  }
  if (parts.length !== 2) return null;
  const a = toNum(parts[0]!);
  const b = toNum(parts[1]!);
  if (a == null || b == null || b === 0) return null;
  return 1 + a / b;
}

function probability(t: string): number | null {
  const p = toNum(t.endsWith('%') ? t.slice(0, -1) : t);
  if (p == null || !(p > 0) || !(p < 100)) return null;
  return 100 / p;
}

function read(t: string, format: OddsFormat): { decimal: number; label: string } | null {
  const L = ODDS_FORMAT_LABEL;
  switch (format) {
    case 'auto': {
      if (t.includes('/')) return wrap(fractional(t), L.fractional);
      if (t.endsWith('%')) return wrap(probability(t), L.probability);
      const s = signed(t);
      if (!s) return null;
      if (s.explicit) return s.abs >= 100 ? wrap(american(s.sign, s.abs), L.american) : wrap(indoMalay(s.sign, s.abs), 'Indonesian / Malay');
      if (s.abs > 0 && s.abs <= 1) return wrap(1 + s.abs, 'Hong Kong / Malay');
      return wrap(s.abs, L.decimal);
    }
    case 'decimal':
      return wrap(toNum(t), L.decimal);
    case 'american': {
      const s = signed(t);
      return s && s.abs > 0 ? wrap(american(s.sign, s.abs), L.american) : null;
    }
    case 'fractional':
      return wrap(fractional(t), L.fractional);
    case 'hongkong':
      return wrap(toNum(t) == null ? null : 1 + toNum(t)!, L.hongkong);
    case 'indonesian':
    case 'malay': {
      const s = signed(t);
      return s && s.abs > 0 ? wrap(indoMalay(s.sign, s.abs), L[format]) : null;
    }
    case 'probability':
      return wrap(probability(t), L.probability);
  }
}

const wrap = (decimal: number | null, label: string) => (decimal == null ? null : { decimal, label });

/**
 * Reads odds typed in any format: decimal, American, fractional, Hong Kong, Indonesian, Malay or implied
 * probability. `auto` guesses from the text (rules in FEATURE_BACKLOG BT-4 / BUILT.md); a picked format reads the
 * text as that format only. Returns null for anything unreadable or that converts to 1 or less.
 */
export function parseOdds(text: string, format: OddsFormat = 'auto'): ParsedOdds | null {
  const t = text.replace(/\s+/g, '').replace(/,/g, '.');
  if (!t) return null;
  const r = read(t, format);
  if (!r || !Number.isFinite(r.decimal) || !(r.decimal > 1)) return null;
  const plain = r.label === ODDS_FORMAT_LABEL.decimal && /^\d+(\.\d+)?$|^\.\d+$/.test(t);
  return { ...r, plain };
}

/**
 * Odds typed in any box (BT-16): any format `parseOdds` auto-detects, always as decimal odds. Plain decimal text
 * keeps its exact value ("1.875"); a converted format is rounded to 2 decimals, as shown ("-114" → 1.88).
 * Null when nothing reads or it is not above 1.
 */
export function oddsFromText(text: string): number | null {
  // a bare "1" would read as Hong Kong evens (2.00); in a bet's odds box it is a typo for odds of 1, so refuse it
  if (/^\s*1([.,]0*)?\s*$/.test(text)) return null;
  const p = parseOdds(text, 'auto');
  if (!p) return null;
  return p.plain ? p.decimal : Math.round(p.decimal * 100) / 100;
}

/** The text an odds box shows once it loses focus: decimal with a dot ("1,3" → "1.3", "-114" → "1.88"); unreadable text stays. */
export function normalizeOddsText(text: string): string {
  const p = oddsFromText(text) == null ? null : parseOdds(text, 'auto');
  if (!p) return text;
  return p.plain ? String(p.decimal) : formatOdds(oddsFromText(text));
}

/** The hint under an odds box while typing another format: "-114 → 1.88"; null for plain decimal or empty text. */
export function oddsHint(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const p = oddsFromText(t) == null ? null : parseOdds(t, 'auto');
  if (!p) return 'Cannot read these odds';
  return p.plain ? null : `${t} → ${formatOdds(oddsFromText(t))} (${p.label})`;
}
