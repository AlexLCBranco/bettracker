// Suggestions for every text field, learned from saved bets.
// Empty query: most recent first. Typed query: matches anywhere (case- and accent-insensitive), ranked by
// "frecency" — each past use counts, recent uses count more (half-life 30 days).
// Leg fields (game, market, selection) narrow to the chosen sport, falling back to all sports when that finds nothing.

import { bestSpelling, nameCasing, tidyGame, tidyNames, tidyUnits, type NameCasing } from './tidy';
import type { Bet } from './types';

export const FIELDS = ['book', 'sport', 'game', 'market', 'selection', 'betText', 'label'] as const;
export type Field = (typeof FIELDS)[number];

interface Use {
  t: number;
  sport: string;
}
interface Entry {
  value: string;
  uses: Use[];
}
export type SuggestIndex = Record<Field, Map<string, Entry>>;

const HALF_LIFE_DAYS = 30;
const DAY = 86_400_000;

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Every proper name spelling ("McCain") in the bets' texts (BT-20). */
export function betNames(bets: Bet[]): NameCasing {
  return nameCasing(bets.flatMap((b) => [b.betText, ...b.legs.flatMap((l) => [l.game, l.selection, l.market])]));
}

/** A value as suggested (BT-20): one game format, stat units in one form, known names cased properly. */
function tidyValue(field: Field, value: string, names: NameCasing): string {
  const v = field === 'game' ? tidyGame(value) : field === 'selection' || field === 'market' || field === 'betText' ? tidyUnits(value.trim()) : value.trim();
  return field === 'book' || field === 'sport' || field === 'label' ? v : tidyNames(v, names);
}

export function buildIndex(bets: Bet[]): SuggestIndex {
  const index = Object.fromEntries(FIELDS.map((f) => [f, new Map<string, Entry>()])) as SuggestIndex;
  const names = betNames(bets);
  const add = (field: Field, value: string, t: number, sport = '') => {
    const v = tidyValue(field, value, names);
    if (!v) return;
    const key = normalize(v);
    const map = index[field];
    const e = map.get(key);
    if (!e) map.set(key, { value: v, uses: [{ t, sport }] });
    else {
      const latest = Math.max(...e.uses.map((u) => u.t));
      // the proper spelling ("McCain" over "Mccain"), else the most recent one
      e.value = bestSpelling([e.value, v], t >= latest ? v : e.value);
      e.uses.push({ t, sport });
    }
  };
  for (const b of bets) {
    const t = Date.parse(b.createdAt) || 0;
    add('book', b.book, t);
    add('betText', b.betText, t);
    add('label', b.label ?? '', t);
    for (const l of b.legs) {
      const sport = normalize(l.sport);
      add('sport', l.sport, t);
      add('game', l.game, t, sport);
      add('market', l.market, t, sport);
      add('selection', l.selection, t, sport);
    }
  }
  return index;
}

const LEG_FIELDS: Field[] = ['game', 'market', 'selection'];

export interface SuggestOptions {
  sport?: string;
  limit?: number;
  now?: number;
}

export function suggest(index: SuggestIndex, field: Field, query: string, opts: SuggestOptions = {}): string[] {
  const { limit = 8, now = Date.now() } = opts;
  const sport = opts.sport && LEG_FIELDS.includes(field) ? normalize(opts.sport) : '';
  const run = (bySport: string) => rank([...index[field].values()], query, bySport, now).slice(0, limit);
  if (sport) {
    const narrowed = run(sport);
    if (narrowed.length) return narrowed;
  }
  return run('');
}

function rank(entries: Entry[], query: string, sport: string, now: number): string[] {
  const q = normalize(query);
  const scored: { value: string; score: number; last: number }[] = [];
  for (const e of entries) {
    const uses = sport ? e.uses.filter((u) => u.sport === sport) : e.uses;
    if (!uses.length) continue;
    if (q && !normalize(e.value).includes(q)) continue;
    let score = 0;
    let last = 0;
    for (const u of uses) {
      score += Math.pow(0.5, Math.max(0, now - u.t) / DAY / HALF_LIFE_DAYS);
      if (u.t > last) last = u.t;
    }
    scored.push({ value: e.value, score, last });
  }
  scored.sort(q ? (a, b) => b.score - a.score || b.last - a.last : (a, b) => b.last - a.last || b.score - a.score);
  return scored.map((s) => s.value);
}

/** The stake amounts used most, most used first (ties: most recent). */
export function stakePresets(bets: Bet[], limit = 5): number[] {
  const m = new Map<number, { n: number; last: number }>();
  for (const b of bets) {
    const t = Date.parse(b.createdAt) || 0;
    const e = m.get(b.stake) ?? { n: 0, last: 0 };
    e.n++;
    e.last = Math.max(e.last, t);
    m.set(b.stake, e);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    .slice(0, limit)
    .map(([s]) => s);
}

/** Defaults for a new bet: the values of the most recently entered bet. */
export function lastUsed(bets: Bet[]) {
  let latest: Bet | undefined;
  for (const b of bets) if (!latest || b.createdAt > latest.createdAt) latest = b;
  return {
    book: latest?.book ?? '',
    sport: latest?.legs.find((l) => l.sport)?.sport ?? '',
    situation: latest?.situation ?? 'pregame',
    type: latest?.type ?? 'solo',
    money: latest?.money ?? 'real',
  } as const;
}
