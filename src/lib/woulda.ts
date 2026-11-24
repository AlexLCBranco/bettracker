// BT-37: "woulda won / woulda lost" on a cashed-out bet. The owner records, by hand, what would have happened without
// the cash-out; the row then shows what the cash-out left on the table (it would have won) or saved (it would have
// lost), and Analytics adds them up as the "Cash-out verdict". Never derived from the free-text actual result.

import { profit } from './money';
import type { Bet, WouldHave } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

type CashedOut = Pick<Bet, 'stake' | 'odds' | 'result' | 'cashout' | 'money' | 'wouldHave'>;

export interface WouldaFigure {
  kind: WouldHave;
  /** won: what the cash-out left (profit if won − profit of the cash-out); lost: what it saved (cash-out − if lost). */
  amount: number;
}

/** The left / saved figure of a cash-out with its would-have set; null otherwise. Bonus money comes out right (profit). */
export function wouldaFigure(b: CashedOut): WouldaFigure | null {
  if (b.result !== 'cash-out' || !b.wouldHave) return null;
  const real = profit(b);
  if (b.wouldHave === 'won') return { kind: 'won', amount: round2(profit({ ...b, result: 'won' }) - real) };
  return { kind: 'lost', amount: round2(real - profit({ ...b, result: 'lost' })) };
}

/** W / L on a cash-out: sets that would-have, or clears it when it is already the one set. */
export const nextWouldHave = (current: WouldHave | null, pressed: WouldHave): WouldHave | null => (current === pressed ? null : pressed);

export interface CashoutVerdict {
  /** Sum of saved − sum of left; null when no cash-out has a would-have set. */
  net: number | null;
  left: number;
  saved: number;
  wouldaWon: number;
  wouldaLost: number;
  notSet: number;
}

/** Analytics: over the cash-outs in `bets` (bet by bet, a rollover's cashed-out bet included). */
export function cashoutVerdict(bets: CashedOut[]): CashoutVerdict {
  const v: CashoutVerdict = { net: null, left: 0, saved: 0, wouldaWon: 0, wouldaLost: 0, notSet: 0 };
  for (const b of bets) {
    if (b.result !== 'cash-out') continue;
    const f = wouldaFigure(b);
    if (!f) v.notSet++;
    else if (f.kind === 'won') {
      v.wouldaWon++;
      v.left += f.amount;
    } else {
      v.wouldaLost++;
      v.saved += f.amount;
    }
  }
  v.left = round2(v.left);
  v.saved = round2(v.saved);
  if (v.wouldaWon + v.wouldaLost > 0) v.net = round2(v.saved - v.left);
  return v;
}
