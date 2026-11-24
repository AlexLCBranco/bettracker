'use client';

// BT-29: bank a won bet, add the next bet to an open shot, close it. Each is one step of the page's undo (Z).
// BT-35: ladders: start one from a won bet, add the next rung, take the money, set the goal.
import { betLabel } from '@/lib/dutch';
import { formatMoney, formatOdds } from '@/lib/money';
import { canBank, canStartLadder, chainOrder, chainSummary, isLadder, ladderOf, newRolloverId } from '@/lib/rollover';
import type { Bet, Ladder } from '@/lib/types';
import { useApp } from './AppProvider';
import type { Settler } from './useSettle';

export interface Rollover {
  /** Every bet of the chain `b` is in (just `b` when it is in none). */
  chainOf(b: Bet): Bet[];
  canBank(b: Bet): boolean;
  bank(b: Bet): void;
  /** Adds the next bet of an open shot, or the next rung of an open ladder. */
  addLeg(chain: Bet[]): void;
  close(chain: Bet[]): void;
  canStartLadder(b: Bet): boolean;
  startLadder(b: Bet): void;
  /** Closes an open ladder as won at the amount banked. */
  take(chain: Bet[]): void;
  setGoal(chain: Bet[], goal: Pick<Ladder, 'goalRungs' | 'goalAmount'>): void;
}

export function useRollover(settle: Settler): Rollover {
  const { bets, update, remove, openNew, notify } = useApp();
  const save = (id: string, patch: Partial<Bet>) => void update(id, patch).catch(() => undefined);
  const chainOf = (b: Bet) => (b.rolloverId ? bets.filter((x) => x.rolloverId === b.rolloverId) : [b]);
  return {
    chainOf,
    canBank: (b) => canBank(b, chainOf(b)),
    bank(b) {
      if (!canBank(b, chainOf(b))) return notify('Only a won bet (not in a dutch, not bonus money, not a ladder rung) can be banked', 'error');
      const before = { rolloverId: b.rolloverId, banked: b.banked };
      const id = b.rolloverId ?? newRolloverId();
      save(b.id, { rolloverId: id, banked: true });
      settle.record(`rollover:${id}`, `Banked for rollover: ${formatMoney(b.stake * b.odds, b.money)}`, () => save(b.id, before));
    },
    addLeg(chain) {
      const s = chainSummary(chain);
      const ladder = isLadder(chain);
      if (s.outcome !== 'open') return notify(ladder ? 'The next rung comes once this one has won' : 'Add a leg to an open shot: bank a won bet first', 'error');
      const first = s.bets[0]!;
      const id = first.rolloverId!;
      openNew(
        { book: s.bets.at(-1)!.book },
        {
          rolloverId: id,
          stake: s.banked,
          money: first.money,
          ladder: ladder ? { ...ladderOf(chain), taken: false } : undefined,
          onSaved: (bet) =>
            settle.record(`rollover:${id}`, `${ladder ? 'Rung' : 'Leg'} added: ${formatMoney(bet.stake, bet.money)} @ ${formatOdds(bet.odds)} ${bet.betText || betLabel(bet)}`, () => void remove(bet.id)),
        },
      );
    },
    close(chain) {
      const ordered = chainOrder(chain);
      const last = ordered.at(-1)!;
      if (isLadder(ordered)) return notify('A ladder ends when a rung loses or with its Take button', 'error');
      if (!last.banked) return;
      if (ordered.some((b) => b.result === 'pending')) return notify('Settle its pending bet first', 'error');
      const before = { rolloverId: last.rolloverId, banked: last.banked };
      // a shot of one bet goes back to being a plain won bet
      const alone = ordered.length === 1;
      save(last.id, alone ? { rolloverId: null, banked: false } : { banked: false });
      settle.record(alone ? `bet:${last.id}` : `rollover:${last.rolloverId}`, alone ? 'Closed: a plain won bet again' : 'Shot closed', () => save(last.id, before));
    },
    canStartLadder,
    startLadder(b) {
      if (!canStartLadder(b)) return notify('A ladder starts from a won bet (not in a dutch or a rollover, not bonus money)', 'error');
      const id = newRolloverId();
      save(b.id, { rolloverId: id, ladder: { goalRungs: null, goalAmount: null, taken: false } });
      settle.record(`rollover:${id}`, `Ladder started: ${formatMoney(b.stake * b.odds, b.money)} rides on the next rung`, () => save(b.id, { rolloverId: null, ladder: null }));
    },
    take(chain) {
      const s = chainSummary(chain);
      if (s.outcome !== 'open' || !isLadder(chain)) return;
      const last = s.bets.at(-1)!;
      const before = last.ladder;
      save(last.id, { ladder: { ...ladderOf(chain), taken: true } });
      settle.record(`rollover:${last.rolloverId}`, `Taken: ${formatMoney(s.banked, last.money)}`, () => save(last.id, { ladder: before }));
    },
    setGoal(chain, goal) {
      const before = chain.map((b) => ({ id: b.id, ladder: b.ladder }));
      for (const b of chain) if (b.ladder) save(b.id, { ladder: { ...b.ladder, ...goal } });
      settle.record(`rollover:${chain[0]!.rolloverId}`, 'Ladder goal set', () => before.forEach((x) => save(x.id, { ladder: x.ladder })));
    },
  };
}
