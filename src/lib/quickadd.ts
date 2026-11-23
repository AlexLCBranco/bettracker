// Quick-add line: "150 @2.10 lakers ml". First standalone number = stake, "@number" = odds, the rest = bet text.
// Rule-based only. Comma or dot decimals. Odds in any format (BT-16): "@-114", "@+220", "@5/2", "@1,3", always stored as decimal.

import { oddsFromText } from './money';
import type { BetType, Money } from './types';

export type QuickAdd =
  | { ok: true; stake: number; odds: number; betText: string; money?: Money }
  | { ok: false; stake: number | null; odds: number | null; betText: string; reason: string; money?: Money };

const NUM = String.raw`\d+(?:[.,]\d+)?`;
/** An odds token after "@": decimal, signed (American / Indonesian / Malay), fractional or a percentage. */
const ODDS = String.raw`[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:\/\d+(?:[.,]\d+)?)?%?`;

export function parseQuickAdd(line: string): QuickAdd {
  let rest = line.trim();
  let odds: number | null = null;
  const oddsMatch = new RegExp(String.raw`(^|\s)@\s*(${ODDS})(?=\s|$)`).exec(rest);
  if (oddsMatch) {
    odds = oddsFromText(oddsMatch[2]!) ?? 0;
    rest = (rest.slice(0, oddsMatch.index) + ' ' + rest.slice(oddsMatch.index + oddsMatch[0].length)).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  let stake: number | null = null;
  // "H$150" = hypothetical money (BT-14), "B$150" = bonus (BT-33), "R$150" = real; no prefix = the last-used money
  let money: Money | undefined;
  const stakeIdx = tokens.findIndex((t) => new RegExp(String.raw`^(?:[RHB]\$)?${NUM}$`, 'i').test(t));
  if (stakeIdx >= 0) {
    const t = tokens[stakeIdx]!;
    if (/^H\$/i.test(t)) money = 'hypothetical';
    else if (/^B\$/i.test(t)) money = 'bonus';
    else if (/^R\$/i.test(t)) money = 'real';
    stake = Number(t.replace(/^[RHB]\$/i, '').replace(',', '.'));
    tokens.splice(stakeIdx, 1);
  }
  const betText = tokens.join(' ');
  const m = money ? { money } : {};
  if (stake == null || !(stake > 0)) return { ok: false, stake: stake && stake > 0 ? stake : null, odds, betText, reason: 'No stake found', ...m };
  if (odds == null) return { ok: false, stake, odds: null, betText, reason: 'No @odds found', ...m };
  if (!(odds > 1)) return { ok: false, stake, odds: null, betText, reason: 'Odds must be above 1', ...m };
  return { ok: true, stake, odds, betText, ...m };
}

/** Splits a line into its leading numbers part ("150 @2.10 ") and the text being typed, for autocomplete. */
export function splitQuickAddText(line: string): { prefix: string; text: string } {
  const tokens = line.match(/\S+\s*/g) ?? [];
  let i = 0;
  while (i < tokens.length && new RegExp(String.raw`^(?:[RHB]\$)?${NUM}\s*$|^@\s*(?:${ODDS})?\s*$`, 'i').test(tokens[i]!)) i++;
  return { prefix: tokens.slice(0, i).join(''), text: tokens.slice(i).join('') };
}

/**
 * BT-17: a quick-add line is a solo bet, unless its text joins two or more selections with " + " ("lakers ml +
 * celtics -5"): then a combination with those legs. Never a combination without legs.
 */
export function quickAddLegs(betText: string): string[] | null {
  const parts = betText.split(/\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/**
 * A "combination" with fewer than 2 legs is really a solo bet (owner, 2026-11-23: "Jokic 6 4Q pts" saved as a
 * Combo with no legs). The one exception: no legs but a bet text joining 2+ selections with " + ", a combination
 * whose legs were not entered.
 */
export const isReallySolo = (type: BetType, legs: unknown[], betText: string) => type === 'combination' && legs.length < 2 && (legs.length === 1 || !quickAddLegs(betText));
