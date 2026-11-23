// BT-33: bonus money and the bankroll: every balance rule.
import { describe, expect, it } from 'vitest';
import { balanceOf, bankroll, conversion, validateEntry, type MoneyEntry } from '@/lib/bankroll';
import { bonusProfitOf, formatMoney, profit, winReturn } from '@/lib/money';
import { parseQuickAdd } from '@/lib/quickadd';
import { byMoney } from '@/lib/scope';
import { summarize } from '@/lib/stats';
import { bet } from './helpers';

let n = 0;
const entry = (over: Partial<MoneyEntry>): MoneyEntry => ({
  id: `e-${++n}`,
  money: 'real',
  direction: 'in',
  amount: 100,
  book: 'Bet365',
  date: '2026-11-01',
  note: '',
  expiry: null,
  createdAt: `2026-11-01T00:00:0${n % 10}.000Z`,
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});
const TODAY = '2026-11-23';

describe('bonus maths', () => {
  it('a won bonus bet pays the winnings only (10 @ 20 pays 190)', () => expect(bonusProfitOf(10, 20, 'won', null)).toBe(190));
  it('a lost bonus bet costs no real money', () => expect(bonusProfitOf(10, 20, 'lost', null)).toBe(0));
  it('void: nothing real (the stake goes back to the bonus)', () => expect(bonusProfitOf(10, 20, 'void', null)).toBe(0));
  it('half results and cash-out', () => {
    expect(bonusProfitOf(10, 3, 'half-won', null)).toBe(10);
    expect(bonusProfitOf(10, 3, 'half-lost', null)).toBe(0);
    expect(bonusProfitOf(10, 3, 'cash-out', 25)).toBe(15);
    expect(bonusProfitOf(10, 3, 'cash-out', 4)).toBe(0);
  });
  it('profit() follows the bet’s money', () => {
    expect(profit(bet({ money: 'bonus', stake: 10, odds: 20, result: 'won' }))).toBe(190);
    expect(profit(bet({ money: 'real', stake: 10, odds: 20, result: 'won' }))).toBe(190);
    expect(profit(bet({ money: 'bonus', stake: 10, odds: 20, result: 'lost' }))).toBe(0);
    expect(profit(bet({ money: 'real', stake: 10, odds: 20, result: 'lost' }))).toBe(-10);
  });
  it('a bonus bet returns its winnings if it wins', () => expect(winReturn({ money: 'bonus', stake: 10, odds: 20 })).toBe(190));
  it('B$ symbol', () => expect(formatMoney(10, 'bonus')).toBe('B$ 10,00'));
  it('quick-add "B$10" is a bonus bet', () => expect(parseQuickAdd('B$10 @20 long shot')).toMatchObject({ ok: true, stake: 10, money: 'bonus' }));
});

describe('totals with bonus bets', () => {
  const bets = [
    bet({ money: 'real', stake: 100, odds: 2, result: 'won' }),
    bet({ money: 'bonus', stake: 10, odds: 20, result: 'won' }),
    bet({ money: 'bonus', stake: 50, odds: 3, result: 'lost' }),
    bet({ money: 'bonus', stake: 20, odds: 3, result: 'pending' }),
    bet({ money: 'hypothetical', stake: 30, odds: 2, result: 'won' }),
  ];
  it('Real counts bonus winnings as profit but never bonus stakes as wagered', () => {
    const s = summarize(byMoney(bets, 'real'));
    expect(s).toMatchObject({ netProfit: 290, totalWagered: 100, settledStake: 100, pendingAmount: 0, betCount: 4 });
    expect(s.roi).toBe(2.9);
  });
  it('bonus converted = real won from bonus / bonus spent', () => {
    const s = summarize(byMoney(bets, 'bonus'));
    expect(s).toMatchObject({ bonusSpent: 60, bonusWon: 190, bonusPending: 20 });
    expect(s.bonusConverted).toBeCloseTo(190 / 60);
    expect(conversion(bets).rate).toBeCloseTo(190 / 60);
  });
  it('no bonus spent → no conversion (not NaN)', () => expect(summarize([bet()]).bonusConverted).toBeNull());
});

describe('validateEntry', () => {
  const ok = { money: 'real', direction: 'in', amount: 100, book: 'Bet365', date: '2026-11-01', note: '' };
  it('accepts a real deposit', () => expect(validateEntry(ok)).toMatchObject({ ok: true, value: { amount: 100, expiry: null } }));
  it('needs a book for real and bonus, not for hypothetical', () => {
    expect(validateEntry({ ...ok, book: '' })).toMatchObject({ ok: false });
    expect(validateEntry({ ...ok, money: 'hypothetical', book: '' })).toMatchObject({ ok: true });
  });
  it('rejects zero, negative and bad dates', () => {
    expect(validateEntry({ ...ok, amount: 0 }).ok).toBe(false);
    expect(validateEntry({ ...ok, amount: -5 }).ok).toBe(false);
    expect(validateEntry({ ...ok, date: '2026-13-01' }).ok).toBe(false);
  });
  it('an expiry only on bonus inserted, not before the date', () => {
    expect(validateEntry({ ...ok, money: 'bonus', expiry: '2026-11-30' })).toMatchObject({ ok: true, value: { expiry: '2026-11-30' } });
    expect(validateEntry({ ...ok, expiry: '2026-11-30' }).ok).toBe(false);
    expect(validateEntry({ ...ok, money: 'bonus', direction: 'out', expiry: '2026-11-30' }).ok).toBe(false);
    expect(validateEntry({ ...ok, money: 'bonus', expiry: '2026-10-30' }).ok).toBe(false);
  });
});

describe('balances', () => {
  it('no entry → "-" (null) and a starting-balance prompt, never a negative made of old bets', () => {
    const b = bankroll([], [bet({ stake: 100, result: 'lost' })], TODAY);
    expect(b.real.total).toBeNull();
    expect(b.real.missing).toEqual(['Bet365']);
    expect(balanceOf(b, 'real', 'Bet365')).toBeNull();
  });

  it('inserted − taken out + settled profit − pending stakes', () => {
    const b = bankroll(
      [entry({ amount: 500 }), entry({ direction: 'out', amount: 50, date: '2026-11-10' })],
      [
        bet({ placedDate: '2026-11-05', stake: 100, odds: 2, result: 'won' }), // +100
        bet({ placedDate: '2026-11-06', stake: 40, odds: 2, result: 'lost' }), // -40
        bet({ placedDate: '2026-11-07', stake: 30, odds: 2, result: 'void' }), // 0
        bet({ placedDate: '2026-11-08', stake: 100, odds: 3, result: 'cash-out', cashout: 120 }), // +20
        bet({ placedDate: '2026-11-09', stake: 25, odds: 2, result: 'pending' }), // -25, pending
      ],
      TODAY,
    );
    expect(b.real.books[0]).toMatchObject({ balance: 505, pending: 25, inserted: 500, takenOut: 50 });
    expect(b.real.total).toBe(505);
    expect(b.real.pending).toBe(25);
  });

  it('bets placed before the first entry of their type + book do not count', () => {
    const b = bankroll([entry({ amount: 200, date: '2026-11-10' })], [bet({ placedDate: '2026-11-09', stake: 100, result: 'lost' }), bet({ placedDate: '2026-11-10', stake: 10, result: 'lost' })], TODAY);
    expect(b.real.books[0]!.balance).toBe(190);
    expect(b.real.missing).toEqual([]);
  });

  it('books are separate; matching ignores case', () => {
    const b = bankroll([entry({ amount: 100, book: 'Bet365' }), entry({ amount: 50, book: 'Betano' })], [bet({ book: 'bet365', stake: 10, result: 'lost' })], TODAY);
    expect(b.real.books.map((x) => [x.book, x.balance])).toEqual([['Bet365', 90], ['Betano', 50]]);
    expect(balanceOf(b, 'real', 'BET365')).toBe(90);
    expect(b.real.total).toBe(140);
  });

  it('bonus: stake out of the bonus balance; a win pays winnings only into REAL; a loss costs nothing real', () => {
    const entries = [entry({ money: 'bonus', amount: 100 }), entry({ money: 'real', amount: 0.01 })];
    const won = bankroll(entries, [bet({ money: 'bonus', stake: 10, odds: 20, result: 'won', placedDate: '2026-11-05' })], TODAY);
    expect(won.bonus.total).toBe(90);
    expect(won.real.total).toBe(190.01);
    const lost = bankroll(entries, [bet({ money: 'bonus', stake: 10, odds: 20, result: 'lost', placedDate: '2026-11-05' })], TODAY);
    expect(lost.bonus.total).toBe(90);
    expect(lost.real.total).toBe(0.01);
  });

  it('bonus void: the stake goes back to the bonus; pending: tied up', () => {
    const entries = [entry({ money: 'bonus', amount: 100 })];
    expect(bankroll(entries, [bet({ money: 'bonus', stake: 10, result: 'void', placedDate: '2026-11-05' })], TODAY).bonus.total).toBe(100);
    const p = bankroll(entries, [bet({ money: 'bonus', stake: 10, result: 'pending', placedDate: '2026-11-05' })], TODAY);
    expect(p.bonus).toMatchObject({ total: 90, pending: 10 });
  });

  it('bonus expiry: the unspent part leaves the balance and is listed as expired unused', () => {
    const entries = [entry({ id: 'old', money: 'bonus', amount: 50, expiry: '2026-11-10' }), entry({ id: 'new', money: 'bonus', amount: 100, date: '2026-11-02', expiry: '2026-12-31' })];
    // 30 spent on 11-05 comes out of the bonus expiring first
    const b = bankroll(entries, [bet({ money: 'bonus', stake: 30, result: 'lost', placedDate: '2026-11-05' })], TODAY);
    expect(b.bonus.books[0]!.expired).toEqual([{ entryId: 'old', amount: 20, expiry: '2026-11-10' }]);
    expect(b.bonus.total).toBe(100);
    expect(b.bonus.books[0]!.nextExpiry).toEqual({ date: '2026-12-31', amount: 100 });
    // before it expires, all of it counts
    const before = bankroll(entries, [bet({ money: 'bonus', stake: 30, result: 'lost', placedDate: '2026-11-05' })], '2026-11-10');
    expect(before.bonus.total).toBe(120);
    expect(before.bonus.books[0]!.nextExpiry).toEqual({ date: '2026-11-10', amount: 20 });
  });

  it('bonus spent after an expiry cannot use the expired lot', () => {
    const entries = [entry({ money: 'bonus', amount: 50, expiry: '2026-11-03' }), entry({ money: 'bonus', amount: 20, date: '2026-11-02' })];
    const b = bankroll(entries, [bet({ money: 'bonus', stake: 30, result: 'lost', placedDate: '2026-11-05' })], TODAY);
    // 20 from the lot without expiry, 10 not covered; the 50 expired unused
    expect(b.bonus.total).toBe(-10);
    expect(b.bonus.books[0]!.expired[0]!.amount).toBe(50);
  });

  it('take out', () => {
    const b = bankroll([entry({ money: 'hypothetical', book: '', amount: 1000 }), entry({ money: 'hypothetical', book: '', direction: 'out', amount: 300 })], [bet({ money: 'hypothetical', book: 'Any', stake: 100, result: 'won', odds: 1.5 })], TODAY);
    // a hypothetical bet of any book uses the no-book pool
    expect(b.hypothetical.total).toBe(750);
  });

  it('a rollover is one money item: first stake in, final payout out', () => {
    const bets = [
      bet({ rolloverId: 'r1', stake: 100, odds: 1.6, result: 'won', placedDate: '2026-11-05', createdAt: '2026-11-05T00:00:00Z' }),
      bet({ rolloverId: 'r1', stake: 160, odds: 1.2, result: 'won', placedDate: '2026-11-06', createdAt: '2026-11-06T00:00:00Z' }),
    ];
    expect(bankroll([entry({ amount: 1000 })], bets, TODAY).real.total).toBe(1092);
  });

  it('extra money items (PP tickets) count like bets', () => {
    const b = bankroll([entry({ money: 'bonus', amount: 100 })], [], TODAY, [{ money: 'bonus', book: 'Bet365', placedDate: '2026-11-05', stake: 5, odds: 20, result: 'pending', cashout: null }]);
    expect(b.bonus).toMatchObject({ total: 95, pending: 5 });
  });
});
