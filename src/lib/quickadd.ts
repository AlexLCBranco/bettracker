// Quick-add line: "150 @2.10 lakers ml". First standalone number = stake, "@number" = odds, the rest = bet text.
// Rule-based only. Comma or dot decimals.

export type QuickAdd =
  | { ok: true; stake: number; odds: number; betText: string }
  | { ok: false; stake: number | null; odds: number | null; betText: string; reason: string };

const NUM = String.raw`\d+(?:[.,]\d+)?`;

export function parseQuickAdd(line: string): QuickAdd {
  let rest = line.trim();
  let odds: number | null = null;
  const oddsMatch = new RegExp(String.raw`(^|\s)@\s*(${NUM})(?=\s|$)`).exec(rest);
  if (oddsMatch) {
    odds = Number(oddsMatch[2]!.replace(',', '.'));
    rest = (rest.slice(0, oddsMatch.index) + ' ' + rest.slice(oddsMatch.index + oddsMatch[0].length)).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  let stake: number | null = null;
  const stakeIdx = tokens.findIndex((t) => new RegExp(String.raw`^(?:R\$)?${NUM}$`, 'i').test(t));
  if (stakeIdx >= 0) {
    stake = Number(tokens[stakeIdx]!.replace(/^R\$/i, '').replace(',', '.'));
    tokens.splice(stakeIdx, 1);
  }
  const betText = tokens.join(' ');
  if (stake == null || !(stake > 0)) return { ok: false, stake: stake && stake > 0 ? stake : null, odds, betText, reason: 'No stake found' };
  if (odds == null) return { ok: false, stake, odds: null, betText, reason: 'No @odds found' };
  if (!(odds > 1)) return { ok: false, stake, odds: null, betText, reason: 'Odds must be above 1' };
  return { ok: true, stake, odds, betText };
}

/** Splits a line into its leading numbers part ("150 @2.10 ") and the text being typed, for autocomplete. */
export function splitQuickAddText(line: string): { prefix: string; text: string } {
  const tokens = line.match(/\S+\s*/g) ?? [];
  let i = 0;
  while (i < tokens.length && new RegExp(String.raw`^(?:@\s*)?(?:R\$)?${NUM}\s*$|^@\s*$`, 'i').test(tokens[i]!)) i++;
  return { prefix: tokens.slice(0, i).join(''), text: tokens.slice(i).join('') };
}
