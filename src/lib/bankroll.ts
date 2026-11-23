// BT-33: the bankroll. Money inserted (or taken out) per money type and book, plus what bets did with it.
//
// Balance per type + book = inserted − taken out + returns of settled bets − stakes of all bets placed, where:
// - real / hypothetical bets: a pending bet's stake is out; a settled bet adds its profit (stake back + winnings);
// - bonus bets: the stake comes out of the BONUS balance (a void's goes back, half results half); the winnings of a
//   won bonus bet go to the REAL balance of that book (src/lib/money.ts, bonusProfitOf);
// - a rollover is one money item (first stake in, final payout out), as everywhere else.
// Bets placed before a type + book's first entry are left out, so old bets never distort it; a type + book with
// bets and no entry has no balance ("-") and asks for a starting balance. A bonus entry with an expiry date stops
// counting the day after it expires: what was not spent by then is listed as "expired unused".

import { normalize } from './autocomplete';
import { isValidISODate } from './dates';
import { bonusSpentOf, profit } from './money';
import { collapseRollovers } from './rollover';
import { MONEY, type Bet, type Money } from './types';

export const DIRECTIONS = ['in', 'out'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface MoneyEntry {
  id: string;
  money: Money;
  /** in = inserted (a deposit, a bonus credited, paper money); out = taken out (a withdrawal or a correction). */
  direction: Direction;
  /** Always above 0; the direction says which way. */
  amount: number;
  /** Optional for hypothetical money only. */
  book: string;
  date: string;
  note: string;
  /** Bonus inserted only: the last day it can be used; null = does not expire. */
  expiry: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntryInput = Omit<MoneyEntry, 'id' | 'createdAt' | 'updatedAt'>;

export const MONEY_LABEL: Record<Money, string> = { real: 'Real', bonus: 'Bonus', hypothetical: 'Hypothetical' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export type ValidatedEntry = { ok: true; value: EntryInput } | { ok: false; error: string };

export function validateEntry(raw: unknown): ValidatedEntry {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Entry must be an object' };
  const r = raw as Record<string, unknown>;
  const money = r.money as Money;
  if (!MONEY.includes(money)) return { ok: false, error: 'Money must be real, bonus or hypothetical' };
  const direction = (r.direction ?? 'in') as Direction;
  if (!DIRECTIONS.includes(direction)) return { ok: false, error: 'Direction must be in or out' };
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? round2(r.amount) : null;
  if (amount == null || amount <= 0) return { ok: false, error: 'Amount must be a number above 0' };
  const book = str(r.book);
  if (!book && money !== 'hypothetical') return { ok: false, error: 'Book is needed for real and bonus money' };
  const date = str(r.date);
  if (!isValidISODate(date)) return { ok: false, error: 'Date must be a valid date' };
  let expiry: string | null = null;
  if (r.expiry != null && r.expiry !== '') {
    if (money !== 'bonus' || direction !== 'in') return { ok: false, error: 'Only bonus money inserted can expire' };
    expiry = str(r.expiry);
    if (!isValidISODate(expiry)) return { ok: false, error: 'Expiry must be a valid date' };
    if (expiry < date) return { ok: false, error: 'Expiry is before the date' };
  }
  return { ok: true, value: { money, direction, amount, book, date, note: str(r.note).slice(0, 200), expiry } };
}

/** What a bet looks like to the bankroll (PP tickets map onto it too, BT-30). */
export type MoneyBet = Pick<Bet, 'money' | 'book' | 'placedDate' | 'stake' | 'odds' | 'result' | 'cashout'>;

export interface ExpiredLot {
  entryId: string;
  amount: number;
  expiry: string;
}

export interface BookBalance {
  money: Money;
  /** The book as first written ("" = hypothetical money with no book). */
  book: string;
  /** The date of the first entry: bets placed before it do not count. */
  start: string;
  balance: number;
  /** Stakes of pending bets (already out of the balance). */
  pending: number;
  inserted: number;
  takenOut: number;
  /** Bonus only. */
  expired: ExpiredLot[];
  nextExpiry: { date: string; amount: number } | null;
}

export interface TypeBalance {
  money: Money;
  /** Across books; null when no book of this type has an entry ("-"). */
  total: number | null;
  pending: number;
  books: BookBalance[];
  /** Books with bets of this type but no entry: they need a starting balance. */
  missing: string[];
  /** Bonus only: real money won from bonus / bonus spent, overall and per book. */
  converted: Conversion | null;
}

export interface Conversion {
  spent: number;
  won: number;
  /** won / spent; null when nothing was spent. */
  rate: number | null;
}

export type Bankroll = Record<Money, TypeBalance>;

const key = (m: Money, book: string) => `${m}\u0000${normalize(book)}`;

interface Lot {
  id: string;
  date: string;
  expiry: string | null;
  left: number;
}

/** Spends `amount` from the lots usable on `date` (soonest expiry first); returns what no lot could cover. */
function spend(lots: Lot[], date: string, amount: number): number {
  let rest = amount;
  const usable = lots.filter((l) => l.left > 0 && l.date <= date && (l.expiry == null || l.expiry >= date)).sort((a, b) => (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : (a.expiry ?? '9999') > (b.expiry ?? '9999') ? 1 : a.date < b.date ? -1 : 1);
  for (const l of usable) {
    if (rest <= 0) break;
    const take = Math.min(l.left, rest);
    l.left = round2(l.left - take);
    rest = round2(rest - take);
  }
  return rest;
}

export function conversion(bets: MoneyBet[]): Conversion {
  let spent = 0;
  let won = 0;
  for (const b of bets) {
    if (b.money !== 'bonus' || b.result === 'pending') continue;
    spent += bonusSpentOf(b);
    won += profit(b);
  }
  spent = round2(spent);
  won = round2(won);
  return { spent, won, rate: spent > 0 ? won / spent : null };
}

/**
 * The whole bankroll on `today`. `bets` are all bets (rollovers are collapsed here); `extra` adds other money items
 * (PP tickets).
 */
export function bankroll(entries: MoneyEntry[], bets: Bet[], today: string, extra: MoneyBet[] = []): Bankroll {
  const items: MoneyBet[] = [...collapseRollovers(bets), ...extra];
  // the pools: one per type + book that has an entry
  const pools = new Map<string, { money: Money; book: string; entries: MoneyEntry[] }>();
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))) {
    const k = key(e.money, e.book);
    if (!pools.has(k)) pools.set(k, { money: e.money, book: e.book, entries: [] });
    pools.get(k)!.entries.push(e);
  }
  // a hypothetical bet whose book has no hypothetical entry uses the no-book pool, when there is one
  const poolOf = (m: Money, book: string) => pools.get(key(m, book)) ?? (m === 'hypothetical' ? pools.get(key(m, '')) : undefined);

  const out = {} as Bankroll;
  for (const money of MONEY) {
    const books: BookBalance[] = [];
    for (const p of pools.values()) {
      if (p.money !== money) continue;
      const start = p.entries[0]!.date;
      // the bets of money `m` that land in this pool (a bonus bet's winnings land in its book's real pool)
      const mine = (m: Money) => items.filter((b) => b.money === m && poolOf(money, b.book) === p && b.placedDate >= start);
      let inserted = 0;
      let takenOut = 0;
      for (const e of p.entries) {
        if (e.direction === 'in') inserted += e.amount;
        else takenOut += e.amount;
      }
      let balance = inserted - takenOut;
      let pending = 0;
      let expired: ExpiredLot[] = [];
      let nextExpiry: BookBalance['nextExpiry'] = null;
      if (money === 'bonus') {
        // bonus lots, spent soonest-expiring first, in date order with the take-outs
        const lots: Lot[] = p.entries.filter((e) => e.direction === 'in').map((e) => ({ id: e.id, date: e.date, expiry: e.expiry, left: e.amount }));
        const events: { date: string; amount: number }[] = [
          ...p.entries.filter((e) => e.direction === 'out').map((e) => ({ date: e.date, amount: e.amount })),
          ...mine('bonus').map((b) => {
            if (b.result === 'pending') pending += b.stake;
            return { date: b.placedDate, amount: b.result === 'pending' ? b.stake : bonusSpentOf(b) };
          }),
        ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        let deficit = 0;
        for (const ev of events) deficit += spend(lots, ev.date, ev.amount);
        expired = lots.filter((l) => l.expiry != null && l.expiry < today && l.left > 0).map((l) => ({ entryId: l.id, amount: l.left, expiry: l.expiry! }));
        const live = lots.filter((l) => !(l.expiry != null && l.expiry < today));
        balance = live.reduce((s, l) => s + l.left, 0) - deficit;
        const soon = live.filter((l) => l.left > 0 && l.expiry != null).map((l) => l.expiry!).sort()[0];
        if (soon) nextExpiry = { date: soon, amount: round2(live.filter((l) => l.expiry === soon).reduce((s, l) => s + l.left, 0)) };
      } else {
        for (const b of mine(money)) {
          if (b.result === 'pending') {
            balance -= b.stake;
            pending += b.stake;
          } else balance += profit(b);
        }
        // a won bonus bet's winnings are real money in that book
        if (money === 'real') for (const b of mine('bonus')) balance += profit(b);
      }
      books.push({ money, book: p.book, start, balance: round2(balance), pending: round2(pending), inserted: round2(inserted), takenOut: round2(takenOut), expired, nextExpiry });
    }
    books.sort((a, b) => a.book.localeCompare(b.book));
    const seen = new Map<string, string>();
    for (const b of items) if (b.money === money && !poolOf(money, b.book) && !seen.has(normalize(b.book))) seen.set(normalize(b.book), b.book);
    out[money] = {
      money,
      total: books.length ? round2(books.reduce((s, b) => s + b.balance, 0)) : null,
      pending: round2(books.reduce((s, b) => s + b.pending, 0)),
      books,
      missing: [...seen.values()].sort(),
      converted: money === 'bonus' ? conversion(items) : null,
    };
  }
  return out;
}

/** The balance of one type + book for the bet form ("what will be left"); null when it has no entry yet. */
export function balanceOf(b: Bankroll, money: Money, book: string): number | null {
  const t = b[money];
  const hit = t.books.find((x) => normalize(x.book) === normalize(book)) ?? (money === 'hypothetical' ? t.books.find((x) => x.book === '') : undefined);
  return hit ? hit.balance : null;
}

/** Bonus converted for the bets of one book. */
export const bookConversion = (bets: MoneyBet[], book: string) => conversion(bets.filter((b) => normalize(b.book) === normalize(book)));
