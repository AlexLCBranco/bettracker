// BT-27: a bet's label and what actually happened on each leg ("actual"), and which legs lost.
// Leg results are often not set when a bet is settled (a dutch settled with 0 or 1-9 + Enter leaves its losing
// splits' legs pending; S marks only the shared leg). knownLegResults fills in what can be worked out, so the row
// can list every losing leg: a won combination's legs all won, a leg's result on another split of the same dutch,
// a stat line ("Jokic 12+ ass", actual "11"), and the last unknown leg of a lost combination whose others all won.

import { normalize } from './autocomplete';
import type { Bet, BetInput, Leg, Result } from './types';

type PlainLeg = Omit<Leg, 'id'>;

/** Legs are "the same leg" across the splits of a dutch when game and selection match (case and accents ignored). */
export const legKey = (l: Pick<Leg, 'game' | 'selection'>) => `${normalize(l.game)}|${normalize(l.selection)}`;

export const isLost = (r: Result) => r === 'lost' || r === 'half-lost';

/** "24 pts #lost by one" → actual "24 pts", label "lost by one". */
export function parseSoloLine(text: string): { actual: string; label: string } {
  const i = text.indexOf('#');
  if (i < 0) return { actual: text.trim(), label: '' };
  return { actual: text.slice(0, i).trim(), label: text.slice(i + 1).trim() };
}

/** The one-line editor's text for a solo bet. */
export const soloLine = (b: Bet) => [b.legs[0]?.actual ?? '', b.label ? `#${b.label}` : ''].filter(Boolean).join(' ');

const NUM = /-?\d+(?:[.,]\d+)?/;
const num = (s: string) => Number(s.replace(',', '.'));

/**
 * A leg's result from its selection and the number that actually happened: "25+ pts" / "over 24.5" need at least /
 * more, "under 24.5" needs less. Null when the selection is not such a line or the actual has no number.
 */
export function inferLegResult(selection: string, actual: string): Result | null {
  // a score ("111-112", "2x1") is not one number
  if (/\d\s*[-x:]\s*\d/i.test(actual)) return null;
  const a = actual.match(NUM);
  if (!a) return null;
  const got = num(a[0]);
  const plus = selection.match(/(\d+(?:[.,]\d+)?)\s*\+/);
  if (plus) return got >= num(plus[1]!) ? 'won' : 'lost';
  const over = selection.match(/\b(?:over|o)\s*(\d+(?:[.,]\d+)?)/i);
  if (over) return got > num(over[1]!) ? 'won' : got === num(over[1]!) ? 'void' : 'lost';
  const under = selection.match(/\b(?:under|u)\s*(\d+(?:[.,]\d+)?)/i);
  if (under) return got < num(under[1]!) ? 'won' : got === num(under[1]!) ? 'void' : 'lost';
  return null;
}

/**
 * Each leg's result as far as it can be told. `siblings`: the other bets of its dutch (none for a plain bet).
 * Solo legs and legs with a result keep it.
 */
export function knownLegResults(b: Bet, siblings: Bet[] = []): Result[] {
  const out = b.legs.map((l) => l.result);
  if (b.type !== 'combination') return out;
  const others = siblings.filter((s) => s.id !== b.id);
  b.legs.forEach((l, i) => {
    if (l.result !== 'pending') return;
    if (b.result === 'won') return void (out[i] = 'won');
    const key = legKey(l);
    for (const s of others) {
      const j = s.legs.findIndex((x) => legKey(x) === key);
      if (j < 0) continue;
      const r = s.type === 'solo' ? s.result : s.legs[j]!.result !== 'pending' ? s.legs[j]!.result : s.result === 'won' ? 'won' : 'pending';
      if (r === 'won' || r === 'lost' || r === 'half-won' || r === 'half-lost' || r === 'void') return void (out[i] = r);
    }
    const inferred = l.actual ? inferLegResult(l.selection, l.actual) : null;
    if (inferred) out[i] = inferred;
  });
  // a lost combination with every leg but one won (or void): that one lost
  if (b.result === 'lost' && !out.some(isLost)) {
    const open = out.flatMap((r, i) => (r === 'pending' ? [i] : []));
    if (open.length === 1) out[open[0]!] = 'lost';
  }
  return out;
}

const plain = (l: Leg | PlainLeg): PlainLeg => ({ sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: l.odds, result: l.result, actual: l.actual ?? '' });

/** The bet's legs with the results knownLegResults works out; null when nothing changes. */
export function withKnownLegs(b: Bet, siblings: Bet[] = []): PlainLeg[] | null {
  const known = knownLegResults(b, siblings);
  if (known.every((r, i) => r === b.legs[i]!.result)) return null;
  return b.legs.map((l, i) => ({ ...plain(l), result: known[i]! }));
}

export interface LossEntry {
  /** The leg's selection only (never its market). */
  name: string;
  actual: string;
}

/** The legs that lost (by knownLegResults), each with what actually happened. Combinations only. */
export function losingLegs(b: Bet, siblings: Bet[] = []): LossEntry[] {
  if (b.type !== 'combination') return [];
  const known = knownLegResults(b, siblings);
  return b.legs.flatMap((l, i) => (isLost(known[i]!) ? [{ name: l.selection.trim() || l.game.trim() || `Leg ${i + 1}`, actual: l.actual }] : []));
}

/** "✗ Jokic 12+ ass 11 · ✗ Celtics ML 111-112". */
export const lossText = (entries: LossEntry[]) => entries.map((e) => `✗ ${e.name}${e.actual ? ` ${e.actual}` : ''}`).join(' · ');

/** The dutch's label when every split has the same one, else ''. */
export function sharedLabel(bets: Bet[]): string {
  const first = bets[0]?.label ?? '';
  return first && bets.every((b) => normalize(b.label) === normalize(first)) ? first : '';
}

// ---- Saving from the inline editor ----

export interface LegEdit {
  betId: string;
  index: number;
  actual: string;
  /** A combination leg's result picked in the editor; left out = keep it (or infer it from the actual). */
  result?: Result;
}

export interface ActualsEdit {
  /** Bets whose label is set to `label` (a dutch row: every split). */
  labelFor?: string[];
  label?: string;
  legs?: LegEdit[];
}

/**
 * The patches an editor save makes. `group`: every bet of the dutch (or just the bet). A leg's actual (and result) is
 * also written to the same leg (game + selection) on the other bets of the group; leg results then get filled in as
 * knownLegResults works them out, so the row lists every losing leg. Only bets that change get a patch.
 */
export function planActuals(group: Bet[], edit: ActualsEdit): { id: string; patch: Partial<BetInput> }[] {
  const legs = new Map(group.map((b) => [b.id, b.legs.map(plain)]));
  for (const e of edit.legs ?? []) {
    const bet = group.find((b) => b.id === e.betId);
    const leg = bet?.legs[e.index];
    if (!bet || !leg) continue;
    const key = legKey(leg);
    for (const b of group) {
      b.legs.forEach((l, i) => {
        if (!(b.id === bet.id ? i === e.index : legKey(l) === key)) return;
        const next = legs.get(b.id)![i]!;
        next.actual = e.actual.trim();
        if (b.type !== 'combination') return; // a solo leg's result is the bet's
        if (e.result) next.result = e.result;
        else if (next.result === 'pending' && next.actual) next.result = inferLegResult(next.selection, next.actual) ?? 'pending';
      });
    }
  }
  const after = group.map((b) => ({ ...b, legs: legs.get(b.id)!.map((l, i) => ({ ...l, id: b.legs[i]!.id })) }));
  const labelled = new Set(edit.labelFor ?? []);
  const out: { id: string; patch: Partial<BetInput> }[] = [];
  for (const b of after) {
    const orig = group.find((g) => g.id === b.id)!;
    const filled = withKnownLegs(b, after) ?? b.legs.map(plain);
    const patch: Partial<BetInput> = {};
    if (filled.some((l, i) => l.actual !== orig.legs[i]!.actual || l.result !== orig.legs[i]!.result)) patch.legs = filled;
    const label = (edit.label ?? '').trim();
    if (labelled.has(b.id) && label !== orig.label) patch.label = label;
    if (Object.keys(patch).length) out.push({ id: b.id, patch });
  }
  return out;
}

/** The distinct legs of a dutch (a shared leg once), each with the bet and index it is edited through. */
export function distinctLegs(bets: Bet[]): { betId: string; index: number; leg: Leg }[] {
  const seen = new Set<string>();
  const out: { betId: string; index: number; leg: Leg }[] = [];
  for (const b of bets)
    b.legs.forEach((l, i) => {
      const k = legKey(l);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ betId: b.id, index: i, leg: l });
    });
  return out;
}
