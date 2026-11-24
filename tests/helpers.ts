import type { Bet, Leg } from '@/lib/types';

let n = 0;

export function leg(over: Partial<Leg> = {}): Leg {
  return { id: `leg-${++n}`, sport: 'Basketball', game: 'Lakers vs Celtics', market: 'Moneyline', selection: 'Lakers', odds: 2, result: 'pending', actual: '', ...over };
}

export function bet(over: Partial<Bet> = {}): Bet {
  const id = `bet-${++n}`;
  return {
    id,
    book: 'Bet365',
    placedDate: '2026-11-20',
    gameDate: '2026-11-20',
    type: 'solo',
    situation: 'pregame',
    stake: 100,
    odds: 2,
    result: 'pending',
    cashout: null,
    preAnalysis: '',
    postAnalysis: '',
    betText: 'lakers ml',
    legs: [leg()],
    dutchId: null,
    rolloverId: null,
    banked: false,
    ladder: null,
    wouldHave: null,
    money: 'real',
    label: '',
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...over,
  };
}

/** The bets of one dutch: solo bets sharing a dutch id, logged one after another. */
export function dutchBets(id: string, rows: Partial<Bet>[]): Bet[] {
  return rows.map((over, i) =>
    bet({ dutchId: id, betText: '', createdAt: `2026-11-20T12:00:00.00${i}Z`, legs: [leg({ selection: `Sel ${i + 1}`, odds: over.odds ?? 2 })], ...over }),
  );
}
