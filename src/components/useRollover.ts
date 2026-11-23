'use client';

// BT-29: bank a won bet, add the next bet to an open shot, close it. Each is one step of the page's undo (Z).
import { betLabel } from '@/lib/dutch';
import { formatMoney, formatOdds } from '@/lib/money';
import { canBank, chainOrder, chainSummary, newRolloverId } from '@/lib/rollover';
import type { Bet } from '@/lib/types';
import { useApp } from './AppProvider';
import type { Settler } from './useSettle';

export interface Rollover {
  /** Every bet of the chain `b` is in (just `b` when it is in none). */
  chainOf(b: Bet): Bet[];
  canBank(b: Bet): boolean;
  bank(b: Bet): void;
  addLeg(chain: Bet[]): void;
  close(chain: Bet[]): void;
}

export function useRollover(settle: Settler): Rollover {
  const { bets, update, remove, openNew, notify } = useApp();
  const save = (id: string, patch: Partial<Bet>) => void update(id, patch).catch(() => undefined);
  const chainOf = (b: Bet) => (b.rolloverId ? bets.filter((x) => x.rolloverId === b.rolloverId) : [b]);
  return {
    chainOf,
    canBank: (b) => canBank(b, chainOf(b)),
    bank(b) {
      if (!canBank(b, chainOf(b))) return notify('Only a won bet (not in a dutch) can be banked', 'error');
      const before = { rolloverId: b.rolloverId, banked: b.banked };
      const id = b.rolloverId ?? newRolloverId();
      save(b.id, { rolloverId: id, banked: true });
      settle.record(`rollover:${id}`, `Banked for rollover: ${formatMoney(b.stake * b.odds, b.money)}`, () => save(b.id, before));
    },
    addLeg(chain) {
      const s = chainSummary(chain);
      if (s.outcome !== 'open') return notify('Add a leg to an open shot: bank a won bet first', 'error');
      const first = s.bets[0]!;
      const id = first.rolloverId!;
      openNew(
        { book: s.bets.at(-1)!.book },
        {
          rolloverId: id,
          stake: s.banked,
          money: first.money,
          onSaved: (bet) => settle.record(`rollover:${id}`, `Leg added: ${formatMoney(bet.stake, bet.money)} @ ${formatOdds(bet.odds)} ${bet.betText || betLabel(bet)}`, () => void remove(bet.id)),
        },
      );
    },
    close(chain) {
      const ordered = chainOrder(chain);
      const last = ordered.at(-1)!;
      if (!last.banked) return;
      if (ordered.some((b) => b.result === 'pending')) return notify('Settle its pending bet first', 'error');
      const before = { rolloverId: last.rolloverId, banked: last.banked };
      // a shot of one bet goes back to being a plain won bet
      const alone = ordered.length === 1;
      save(last.id, alone ? { rolloverId: null, banked: false } : { banked: false });
      settle.record(alone ? `bet:${last.id}` : `rollover:${last.rolloverId}`, alone ? 'Closed: a plain won bet again' : 'Shot closed', () => save(last.id, before));
    },
  };
}
