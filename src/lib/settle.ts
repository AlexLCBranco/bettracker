// Settle queue: pending bets whose game date is today or earlier, oldest first, settled by key with undo.
// A dutch is one item: number keys toggle the splits that won, Enter confirms (the rest lose), 0 = none won,
// V = void all, S = its shared leg lost (every split lost, that leg marked lost on each bet).

import { isLost, legKey, withKnownLegs } from './actuals';
import { groupRows, isLeg, sharedLegNames } from './dutch';
import type { Bet, Leg, Result } from './types';

export type QueueItem =
  | { kind: 'bet'; key: string; bet: Bet }
  /** `bets`: every bet of the dutch; `pending`: those still to settle (what the number keys pick from). */
  | {
      kind: 'dutch';
      key: string;
      dutchId: string;
      bets: Bet[];
      pending: Bet[];
    };

const due = (b: Bet) => b.gameDate || b.placedDate;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const min = (xs: string[]) => xs.reduce((a, b) => (b < a ? b : a));

export function settleQueue(bets: Bet[], today: string): QueueItem[] {
  const items: {
    item: QueueItem;
    due: string;
    placed: string;
    created: string;
  }[] = [];
  for (const r of groupRows(bets)) {
    // BT-29: a rollover's pending bet is settled like a plain bet (its shot is shown around it)
    for (const b of r.kind === 'bet' ? [r.bet] : r.kind === 'rollover' ? r.bets : []) {
      if (b.result === 'pending' && due(b) <= today)
        items.push({
          item: { kind: 'bet', key: b.id, bet: b },
          due: due(b),
          placed: b.placedDate,
          created: b.createdAt,
        });
    }
    if (r.kind !== 'dutch') continue;
    const pending = r.bets.filter((b) => b.result === 'pending');
    if (!pending.some((b) => due(b) <= today)) continue;
    items.push({
      item: {
        kind: 'dutch',
        key: r.dutchId,
        dutchId: r.dutchId,
        bets: r.bets,
        pending,
      },
      due: min(pending.map(due)),
      placed: min(pending.map((b) => b.placedDate)),
      created: min(pending.map((b) => b.createdAt)),
    });
  }
  return items.sort((a, b) => cmp(a.due, b.due) || cmp(a.placed, b.placed) || cmp(a.created, b.created)).map((x) => x.item);
}

/** Keys of the settle queue → result. C (cash-out) asks for the amount first. Plain bets only. */
export const SETTLE_KEYS: Record<string, Result> = {
  w: 'won',
  l: 'lost',
  v: 'void',
  c: 'cash-out',
  h: 'half-won',
  j: 'half-lost',
};

export interface SettleChange {
  id: string;
  result: Result;
  cashout: number | null;
  /** The bet's legs with new results, when the settle changes them (and, in an undo entry, what they were). */
  legs?: Omit<Leg, 'id'>[];
}

const plainLegs = (b: Bet): Omit<Leg, 'id'>[] => b.legs.map((l) => ({ sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: l.odds, result: l.result, actual: l.actual }));
const legsAs = (b: Bet, result: (l: Leg) => Result): Omit<Leg, 'id'>[] => plainLegs(b).map((l, i) => ({ ...l, result: result(b.legs[i]!) }));

export interface UndoEntry {
  /** What the bets were before, to restore (one bet, or every bet a dutch settle changed). */
  before: SettleChange[];
  /** Queue position the item was at, to put the cursor back. */
  index: number;
}

export interface SettleState {
  cursor: number;
  undo: UndoEntry[];
}

export interface SettleStep {
  changes: SettleChange[];
  state: SettleState;
}

/**
 * BT-27: after a settle, the legs whose result can now be worked out (a lost split's legs that won on a winning split,
 * the last unknown leg of a lost combination) are set too, so every losing leg is listed on the row.
 */
function fillLegs(bets: Bet[], changes: SettleChange[]): SettleChange[] {
  const after = bets.map((b) => {
    const c = changes.find((x) => x.id === b.id);
    return c ? { ...b, result: c.result, legs: c.legs ? c.legs.map((l, i) => ({ ...l, id: b.legs[i]?.id ?? String(i) })) : b.legs } : b;
  });
  return changes.map((c) => {
    const b = after.find((x) => x.id === c.id);
    const legs = b && withKnownLegs(b, after);
    return legs ? { ...c, legs } : c;
  });
}

/** The cursor stays on the same position, which now shows the next item (the settled one leaves the queue). */
function step(queue: QueueItem[], state: SettleState, settled: Bet[], changes: SettleChange[]): SettleStep {
  const nextLen = queue.length - 1;
  return {
    changes,
    state: {
      cursor: Math.max(0, Math.min(state.cursor, nextLen - 1)),
      undo: [
        ...state.undo,
        {
          before: settled.map((b): SettleChange => {
            const touched = changes.find((c) => c.id === b.id)?.legs;
            return {
              id: b.id,
              result: b.result,
              cashout: b.cashout,
              ...(touched ? { legs: plainLegs(b) } : {}),
            };
          }),
          index: state.cursor,
        },
      ],
    },
  };
}

/** Settles the plain bet under the cursor. A dutch is settled with settleDutchAt instead. */
export function settleAt(queue: QueueItem[], state: SettleState, result: Result, cashout: number | null = null): SettleStep | null {
  const item = queue[state.cursor];
  if (!item || item.kind !== 'bet' || result === 'pending') return null;
  if (result === 'cash-out' && (cashout == null || !(cashout >= 0))) return null;
  const bet = item.bet;
  return step(queue, state, [bet], fillLegs([bet], [{ id: bet.id, result, cashout: result === 'cash-out' ? cashout : null }]));
}

/**
 * Settles the dutch under the cursor: `winners` are the indexes (0-based) of the pending bets that won (a single
 * number for one), which become won and the other pending bets lost; 'none' = all lost; 'void' = all void. A
 * combination that won gets every leg marked won; lost or void leaves its legs as they are. Bets already settled stay
 * as they are.
 */
export function settleDutchAt(queue: QueueItem[], state: SettleState, winners: number | number[] | 'none' | 'void'): SettleStep | null {
  const item = queue[state.cursor];
  if (!item || item.kind !== 'dutch') return null;
  const won = new Set(typeof winners === 'number' ? [winners] : Array.isArray(winners) ? winners : []);
  for (const w of won) if (!item.pending[w]) return null;
  const changes = item.pending.map((b, i): SettleChange => {
    if (winners === 'void') return { id: b.id, result: 'void', cashout: null };
    if (!won.has(i)) return { id: b.id, result: 'lost', cashout: null };
    return {
      id: b.id,
      result: 'won',
      cashout: null,
      ...(b.type === 'combination' && b.legs.length ? { legs: legsAs(b, () => 'won') } : {}),
    };
  });
  return step(queue, state, item.pending, fillLegs(item.bets, changes));
}

/** The one shared leg of the dutch under the cursor (S needs exactly one), or why S cannot be used. */
export function sharedLegOf(item: QueueItem | undefined): { name: string } | { error: string } {
  if (item?.kind !== 'dutch') return { error: 'S is for a dutch' };
  const names = sharedLegNames(item.bets);
  if (!names.length) return { error: 'This dutch has no shared leg' };
  if (names.length > 1)
    return {
      error: `This dutch has ${names.length} shared legs (${names.join(', ')}): settle it in History`,
    };
  return { name: names[0]! };
}

/** S: the dutch's shared leg lost, so every pending split lost and that leg is marked lost on each of them. */
export function settleSharedLostAt(queue: QueueItem[], state: SettleState): SettleStep | null {
  const item = queue[state.cursor];
  const shared = sharedLegOf(item);
  if (item?.kind !== 'dutch' || 'error' in shared) return null;
  const changes = item.pending.map((b): SettleChange => ({
    id: b.id,
    result: 'lost',
    cashout: null,
    legs: legsAs(b, (l) => (isLeg(l.selection, shared.name) ? 'lost' : l.result)),
  }));
  return step(queue, state, item.pending, fillLegs(item.bets, changes));
}

/** Undoes the last settle (a whole dutch in one step): the changes that restore it, and the cursor back on it. */
export function undoLast(state: SettleState): SettleStep | null {
  const last = state.undo[state.undo.length - 1];
  if (!last) return null;
  return {
    changes: last.before,
    state: { cursor: last.index, undo: state.undo.slice(0, -1) },
  };
}

export function moveCursor(queue: QueueItem[], state: SettleState, delta: number): SettleState {
  if (!queue.length) return { ...state, cursor: 0 };
  return {
    ...state,
    cursor: Math.max(0, Math.min(queue.length - 1, state.cursor + delta)),
  };
}

// ---- Settle buttons on a dutch row (BT-10) ----
// The History / dashboard row settles a dutch with the same functions as the Settle page, on a one-item queue.

/** What a dutch row's buttons do: 0 W, All W, the picked winners (indexes into its pending bets), Shared ✕, V. */
export type DutchRowAction = 'none' | 'all' | 'void' | 'shared' | number[];

/** A dutch as a one-item queue holding its pending bets, whatever their dates. */
export function dutchQueue(dutchId: string, bets: Bet[]): QueueItem[] {
  return [{ kind: 'dutch', key: dutchId, dutchId, bets, pending: bets.filter((b) => b.result === 'pending') }];
}

/** Settles a dutch row; null when there is nothing to settle (or no single shared leg for 'shared'). Undo: undoLast(step.state). */
export function settleDutchRow(dutchId: string, bets: Bet[], action: DutchRowAction): SettleStep | null {
  const queue = dutchQueue(dutchId, bets);
  const item = queue[0] as Extract<QueueItem, { kind: 'dutch' }>;
  if (!item.pending.length) return null;
  const state: SettleState = { cursor: 0, undo: [] };
  if (action === 'shared') return settleSharedLostAt(queue, state);
  if (action === 'all') return settleDutchAt(queue, state, item.pending.map((_, i) => i));
  if (Array.isArray(action)) return settleDutchAt(queue, state, action.length ? action : 'none');
  return settleDutchAt(queue, state, action);
}

// ---- BT-28: leg results and bet results always agree ----
// Leg → up: a lost leg loses its bet; every leg won wins it; a void leg leaves it to the owner. A shared leg of a dutch
// (same game + selection on other splits) gets the same result on every split. Bet → down: won → its legs won;
// set back to pending → its legs pending; lost with no losing leg known → its pending legs read "?" (display only).

/** A bet's result as its legs say it; only pending / won / lost bets follow their legs (cash-outs, halves, void stay). */
function resultFromLegs(b: Bet, legs: Pick<Leg, 'result'>[], editedWas: Result | null): Result {
  if (b.result !== 'pending' && b.result !== 'won' && b.result !== 'lost') return b.result;
  if (b.type === 'solo') {
    const r = legs[0]?.result;
    return r === 'won' || r === 'lost' ? r : r === 'pending' && editedWas && editedWas === b.result ? 'pending' : b.result;
  }
  if (legs.some((l) => isLost(l.result))) return 'lost';
  if (legs.length && legs.every((l) => l.result === 'won')) return 'won';
  // the change took away what had settled it: the leg that lost, or one of the legs that won
  if (b.result === 'won') return 'pending';
  if (b.result === 'lost' && editedWas && isLost(editedWas)) return 'pending';
  return b.result;
}

/** Rule 3: a combination's legs after its result is set by hand (won → every leg won, pending → every leg pending). */
export function legsForResult(b: Bet, result: Result): Omit<Leg, 'id'>[] | undefined {
  if (b.type !== 'combination' || !b.legs.length) return undefined;
  if (result === 'won') return legsAs(b, (l) => (l.result === 'void' ? 'void' : 'won'));
  if (result === 'pending') return legsAs(b, () => 'pending');
  return undefined;
}

/** What each bet was before `changes`, to undo them in one step. */
export function beforeOf(bets: Bet[], changes: SettleChange[]): SettleChange[] {
  return changes.flatMap((c) => {
    const b = bets.find((x) => x.id === c.id);
    return b ? [{ id: b.id, result: b.result, cashout: b.cashout, ...(c.legs ? { legs: plainLegs(b) } : {}) }] : [];
  });
}

const sameLegResults = (b: Bet, legs: Omit<Leg, 'id'>[] | undefined) => !legs || legs.every((l, i) => l.result === b.legs[i]?.result);

/** Drops changes that change nothing. */
const real = (bets: Bet[], changes: SettleChange[]) =>
  changes.filter((c) => {
    const b = bets.find((x) => x.id === c.id);
    return !b || b.result !== c.result || b.cashout !== c.cashout || !sameLegResults(b, c.legs);
  });

/**
 * A bet's result set from its row (W / L / V buttons, the result pill): the change for it, its legs set by rule 3,
 * and legs worked out from the other bets of its dutch (`group`, the bet itself for a plain bet).
 */
export function betResultChanges(group: Bet[], b: Bet, result: Result, cashout: number | null = null): SettleChange[] {
  if (result === 'cash-out' && (cashout == null || !(cashout >= 0))) return [];
  const legs = legsForResult(b, result);
  const change: SettleChange = { id: b.id, result, cashout: result === 'cash-out' ? cashout : null, ...(legs ? { legs } : {}) };
  const filled = result === 'pending' ? [change] : fillLegs(group.some((x) => x.id === b.id) ? group : [...group, b], [change]);
  return real(group.concat(b), filled);
}

/**
 * A leg's result set by its W / L / V buttons. `group`: every bet of the dutch (or just the bet). The same leg on the
 * other bets of the group gets the same result; then each touched bet's result follows its legs (rule 2), and legs
 * that can now be worked out are filled in. Only bets that change are returned.
 */
export function legResultChanges(group: Bet[], betId: string, index: number, result: Result): SettleChange[] {
  const bet = group.find((b) => b.id === betId);
  const leg = bet?.legs[index];
  if (!bet || !leg) return [];
  const key = legKey(leg);
  const changes: SettleChange[] = [];
  for (const b of group) {
    const hits = b.legs.flatMap((l, i) => ((b.id === betId ? i === index : legKey(l) === key) ? [i] : []));
    if (!hits.length) continue;
    const was = b.legs[hits[0]!]!.result;
    const legs = legsAs(b, (l) => (hits.some((i) => b.legs[i] === l) ? result : l.result));
    const next = resultFromLegs(b, legs, was);
    const downLegs = next !== b.result && next === 'won' ? legsForResult(b, 'won') : undefined;
    changes.push({ id: b.id, result: next, cashout: next === b.result ? b.cashout : null, legs: downLegs ?? legs });
  }
  return real(group, fillLegs(group, changes));
}

/**
 * Rule 5, for bets logged before BT-28: a won combination's pending legs become won, and a lost one's legs are filled
 * in where they can be worked out (other splits of its dutch, the last unknown leg). The legs that change, per bet.
 */
export function repairLegs(bets: Bet[]): { id: string; legs: Omit<Leg, 'id'>[] }[] {
  const out: { id: string; legs: Omit<Leg, 'id'>[] }[] = [];
  for (const b of bets) {
    if (b.type !== 'combination' || !b.legs.some((l) => l.result === 'pending')) continue;
    const group = b.dutchId ? bets.filter((x) => x.dutchId === b.dutchId) : [b];
    const legs = b.result === 'won' ? legsForResult(b, 'won') : b.result === 'lost' ? (withKnownLegs(b, group) ?? undefined) : undefined;
    if (legs && !sameLegResults(b, legs)) out.push({ id: b.id, legs });
  }
  return out;
}
