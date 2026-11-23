// BT-20: saved text written the same way everywhere. Rule-based, no index needed except for name casing.
//  - one game format: "Celtics @ Warriors", "Celtics v Knicks", "Flamengo x Palmeiras" → "… vs …"
//  - stat units lower case: "25 PTS" → "25 pts"
//  - proper name casing: a name typed "Mccain" or "mccain" is written "McCain" once "McCain" has been seen

/** "@", "v", "v.", "vs", "vs.", "x" between two names → " vs ". */
const GAME_SEP = /\s+(?:@|vs?\.?|x)\s+/gi;

export function tidyGame(game: string): string {
  return game.trim().replace(GAME_SEP, ' vs ');
}

/** The two sides of a game ("Celtics vs Knicks" → ["Celtics", "Knicks"]); [] when it is not "A vs B". */
export function gameTeams(game: string): string[] {
  const parts = tidyGame(game).split(' vs ');
  return parts.length === 2 && parts.every((p) => p.trim()) ? parts.map((p) => p.trim()) : [];
}

const UNITS = ['pts', 'reb', 'rebs', 'ast', 'asts', 'stl', 'stls', 'blk', 'blks', 'tov', 'pra', '3pm', 'sog'];
const UNIT_RE = new RegExp(String.raw`(^|[^A-Za-z0-9])(${UNITS.join('|')})(?![A-Za-z0-9])`, 'gi');

/** Stat units in one form: lower case ("PTS", "Pts" → "pts"). */
export function tidyUnits(text: string): string {
  return text.replace(UNIT_RE, (_m, pre: string, unit: string) => pre + unit.toLowerCase());
}

/** A word whose capitals are not only its first letter ("McCain", "LeBron", "DeRozan"): a proper spelling. */
const PROPER = /^[A-Z][a-z]+[A-Z][A-Za-z]*$/;
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]+/g;

/** Proper spellings seen in any text, by lower case ("mccain" → "McCain"). */
export type NameCasing = Map<string, string>;

export function nameCasing(texts: Iterable<string>): NameCasing {
  const m: NameCasing = new Map();
  for (const t of texts) for (const w of t.match(WORD) ?? []) if (PROPER.test(w)) m.set(w.toLowerCase(), w);
  return m;
}

/** Words written the proper way when one is known ("Mccain 25+ pts" → "McCain 25+ pts"). */
export function tidyNames(text: string, names: NameCasing): string {
  if (!names.size) return text;
  return text.replace(WORD, (w) => names.get(w.toLowerCase()) ?? w);
}

/** Selection, market, bet text: units and names. */
export const tidyText = (text: string, names: NameCasing = new Map()) => tidyNames(tidyUnits(text), names);

/**
 * Of several spellings of one value, the one to keep: a proper spelling (inner capitals) beats the rest, then mixed
 * case beats all lower / all upper case; ties go to `fallback` (the most recent one).
 */
export function bestSpelling(spellings: string[], fallback: string): string {
  const score = (s: string) => {
    const words = s.match(WORD) ?? [];
    const proper = words.filter((w) => PROPER.test(w)).length;
    const mixed = s !== s.toLowerCase() && s !== s.toUpperCase() ? 1 : 0;
    return proper * 2 + mixed;
  };
  let best = fallback;
  for (const s of spellings) if (score(s) > score(best)) best = s;
  return best;
}

interface TidyBet {
  betText: string;
  legs: { game: string; market: string; selection: string }[];
}

/** A bet's texts tidied before it is saved: games in one format, units in one form, known names cased properly. */
export function tidyBet<T extends TidyBet>(b: T, names: NameCasing = new Map()): T {
  return {
    ...b,
    betText: tidyText(b.betText, names),
    legs: b.legs.map((l) => ({ ...l, game: tidyNames(tidyGame(l.game), names), market: tidyText(l.market, names), selection: tidyText(l.selection, names) })),
  };
}
