import type { Bet, Leg } from '@/lib/types';

let n = 0;

export function leg(over: Partial<Leg> = {}): Leg {
  return { id: `leg-${++n}`, sport: 'Basketball', game: 'Lakers vs Celtics', market: 'Moneyline', selection: 'Lakers', odds: 2, result: 'pending', ...over };
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
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...over,
  };
}
