import { describe, expect, it } from 'vitest';
import { breakdown } from '@/lib/analytics';
import { countBets, draftToBets, duplicateDutchDraft, dutchSummary, groupOutcome, groupRows, newDutchDraft, resolvedBooks } from '@/lib/dutch';
import { filterBets, NO_FILTERS } from '@/lib/filters';
import { summarize } from '@/lib/stats';
import { bet, dutchBets, leg } from './helpers';

describe('groupRows', () => {
  it('a dutch is one row at its first bet, bets in the order logged; other bets keep their order', () => {
    const a = bet();
    const d = dutchBets('d1', [{}, {}, {}]);
    const b = bet();
    const rows = groupRows([a, d[2]!, b, d[0]!, d[1]!]);
    expect(rows.map((r) => (r.kind === 'bet' ? r.bet.id : r.dutchId))).toEqual([a.id, 'd1', b.id]);
    expect(rows[1]!.kind === 'dutch' && rows[1]!.bets.map((x) => x.id)).toEqual(d.map((x) => x.id));
  });
});

describe('group outcome and counts', () => {
  it('won when net profit is above 0, lost below 0, neither at exactly 0', () => {
    // 60 @2 won = +60, 40 @3 lost = -40 → +20
    expect(groupOutcome(dutchBets('a', [{ stake: 60, odds: 2, result: 'won' }, { stake: 40, odds: 3, result: 'lost' }]))).toBe('won');
    expect(groupOutcome(dutchBets('b', [{ stake: 60, result: 'lost' }, { stake: 40, result: 'lost' }]))).toBe('lost');
    // 50 @2 won = +50, 50 lost = -50 → exactly 0
    expect(groupOutcome(dutchBets('c', [{ stake: 50, odds: 2, result: 'won' }, { stake: 50, result: 'lost' }]))).toBe('even');
    expect(groupOutcome(dutchBets('v', [{ result: 'void' }, { result: 'void' }]))).toBe('even');
  });

  it('pending while any of its bets is pending', () => {
    expect(groupOutcome(dutchBets('p', [{ result: 'won' }, { result: 'pending' }]))).toBe('pending');
  });

  it('counts a dutch as one bet; money stays bet by bet', () => {
    const bets = [
      bet({ result: 'won', stake: 100, odds: 2 }), // +100
      bet({ result: 'lost', stake: 10 }), // -10
      ...dutchBets('w', [{ stake: 60, odds: 2, result: 'won' }, { stake: 40, odds: 3, result: 'lost' }]), // +20, a win
      ...dutchBets('e', [{ stake: 50, odds: 2, result: 'won' }, { stake: 50, result: 'lost' }]), // 0, neither
      ...dutchBets('p', [{ stake: 30, odds: 2, result: 'lost' }, { stake: 20, result: 'pending' }]), // -30 settled, pending
    ];
    expect(countBets(bets)).toEqual({ count: 5, pending: 1, wins: 2, losses: 1 });
    const s = summarize(bets);
    expect(s).toMatchObject({ betCount: 5, pendingCount: 1, wins: 2, losses: 1, pendingAmount: 20, netProfit: 80, totalWagered: 360, settledStake: 340 });
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.roi).toBeCloseTo(80 / 340);
  });

  it('dutchSummary: total stake, combined odds 1/Σ(1/odds), net of settled bets', () => {
    const s = dutchSummary(dutchBets('s', [{ stake: 60, odds: 2, result: 'won' }, { stake: 40, odds: 3, result: 'pending' }]));
    expect(s.stake).toBe(100);
    expect(s.combinedOdds).toBeCloseTo(1.2);
    expect(s.profit).toBe(60);
    expect(s.outcome).toBe('pending');
  });
});

describe('analytics with dutches', () => {
  it('"by type" has Dutch; counts are per dutch, money per bet', () => {
    const rows = breakdown(
      [bet({ result: 'won' }), ...dutchBets('d', [{ stake: 60, odds: 2, result: 'won' }, { stake: 40, odds: 3, result: 'lost' }])],
      'type',
    );
    const dutch = rows.find((r) => r.label === 'Dutch')!;
    expect(dutch).toMatchObject({ bets: 1, wins: 1, losses: 0, wagered: 100, profit: 20, winRate: 1 });
    expect(rows.find((r) => r.label === 'Solo')).toMatchObject({ bets: 1, wins: 1 });
  });

  it('a dutch split across books is one bet in each book, judged by its bets there', () => {
    const rows = breakdown(dutchBets('d', [{ book: 'A', stake: 60, odds: 2, result: 'won' }, { book: 'B', stake: 40, odds: 3, result: 'lost' }]), 'book');
    expect(rows.find((r) => r.label === 'A')).toMatchObject({ bets: 1, wins: 1, profit: 60 });
    expect(rows.find((r) => r.label === 'B')).toMatchObject({ bets: 1, losses: 1, profit: -40 });
  });
});

describe('filters with dutches', () => {
  it('a dutch matches as a whole when any of its bets matches', () => {
    const d = dutchBets('f', [{ legs: [leg({ selection: 'Lakers' })] }, { legs: [leg({ selection: 'Celtics' })] }]);
    const other = bet({ legs: [leg({ game: 'Heat vs Bulls', selection: 'Heat' })] });
    expect(filterBets([other, ...d], { ...NO_FILTERS, text: 'celtics' }).map((b) => b.id)).toEqual(d.map((b) => b.id));
  });

  it('type Dutch shows only dutches; Solo leaves them out', () => {
    const d = dutchBets('t', [{}, {}]);
    const solo = bet();
    expect(filterBets([solo, ...d], { ...NO_FILTERS, type: 'dutch' })).toEqual(d);
    expect(filterBets([solo, ...d], { ...NO_FILTERS, type: 'solo' })).toEqual([solo]);
  });
});

describe('log as bets', () => {
  const rows = [
    { selection: 'Home', odds: 2.5, stake: 40 },
    { selection: 'Draw', odds: 3.2, stake: 31.25 },
    { selection: 'Away', odds: 4.0, stake: 25 },
  ];

  it('books: first row the last-used book, the others copy the row above until changed', () => {
    const d = newDutchDraft(rows, { sport: 'Football', situation: 'pregame' }, '2026-11-22');
    expect(resolvedBooks(d.rows, 'Betano')).toEqual(['Betano', 'Betano', 'Betano']);
    d.rows[1]!.book = 'Bet365';
    expect(resolvedBooks(d.rows, 'Betano')).toEqual(['Betano', 'Bet365', 'Bet365']);
  });

  it('one pending solo bet per selection, all with the same dutch id, unrounded odds kept', () => {
    const d = { ...newDutchDraft([{ ...rows[0]!, odds: 1 + 100 / 150 }, rows[1]!], { sport: 'Football', situation: 'live' }, '2026-11-22'), games: ['A x B'], markets: ['1X2'] };
    const r = draftToBets(d, 'Betano', 'dutch-1', '2026-11-22');
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toHaveLength(2);
    expect(r.value[0]).toMatchObject({ type: 'solo', result: 'pending', book: 'Betano', stake: 40, odds: 1 + 100 / 150, dutchId: 'dutch-1', situation: 'live', placedDate: '2026-11-22', gameDate: '2026-11-22' });
    expect(r.value[0]!.legs).toEqual([{ sport: 'Football', game: 'A x B', market: '1X2', selection: 'Home', odds: 1 + 100 / 150, result: 'pending' }]);
    expect(r.value[1]!.dutchId).toBe('dutch-1');
  });

  it('refuses a zero stake (R$ 1 rounding) and bad dates', () => {
    const d = newDutchDraft([rows[0]!, { ...rows[1]!, stake: 0 }], { sport: '', situation: 'pregame' }, '2026-11-22');
    expect(draftToBets(d, '', 'x', '2026-11-22')).toEqual({ ok: false, error: 'Draw: Stake must be a number above 0' });
    expect(draftToBets({ ...newDutchDraft(rows, { sport: '', situation: 'pregame' }), placedDate: '99/99' }, '', 'x')).toMatchObject({ ok: false });
  });

  it('duplicate: same selections, odds, stakes and books, dated today', () => {
    const d = dutchBets('o', [{ book: 'A', stake: 60, odds: 2, result: 'won', placedDate: '2026-01-01' }, { book: 'B', stake: 40, odds: 3, result: 'lost' }]);
    const draft = duplicateDutchDraft(d, '2026-11-22');
    expect(draft.rows).toEqual([
      { selection: 'Sel 1', odds: 2, stake: 60, book: 'A', legs: [{ selection: 'Sel 1', odds: 2, game: 'Lakers vs Celtics', market: 'Moneyline' }] },
      { selection: 'Sel 2', odds: 3, stake: 40, book: 'B', legs: [{ selection: 'Sel 2', odds: 3, game: 'Lakers vs Celtics', market: 'Moneyline' }] },
    ]);
    expect(draft).toMatchObject({ games: ['Lakers vs Celtics'], markets: ['Moneyline'], shared: [] });
    expect(draft.placedDate).toBe('22/11/2026');
  });
});
