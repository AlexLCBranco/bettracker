import type { Bet, Result } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Profit of a settled bet (0 for pending). */
export function profitOf(stake: number, odds: number, result: Result, cashout: number | null): number {
  switch (result) {
    case 'won':
      return round2(stake * (odds - 1));
    case 'lost':
      return round2(-stake);
    case 'void':
    case 'pending':
      return 0;
    case 'cash-out':
      return round2((cashout ?? 0) - stake);
    case 'half-won':
      return round2((stake / 2) * (odds - 1));
    case 'half-lost':
      return round2(-stake / 2);
  }
}

export const profit = (b: Pick<Bet, 'stake' | 'odds' | 'result' | 'cashout'>) => profitOf(b.stake, b.odds, b.result, b.cashout);

/** Stake × odds: what a winning bet pays back in total. */
export const potentialReturn = (stake: number, odds: number) => (stake > 0 && odds > 0 ? round2(stake * odds) : 0);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.234,50"; with sign, "+R$ 10,00" / "-R$ 10,00". */
export function formatBRL(n: number, signed = false): string {
  const s = brl.format(Math.abs(n)).replace(/ /g, ' ');
  if (!signed) return n < 0 ? `-${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

export const formatOdds = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(2));

/** Parses "150", "2.10", "2,10", "R$ 150". Returns null for anything else. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/i, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
