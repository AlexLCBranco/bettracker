// BT-29: rollover shots. Owner's example: R$ 100 @ 1.60 wins → R$ 160 → all of it on a 1.20 = one shot, R$ 100 @ 1.92.
import { describe, expect, it } from 'vitest';
import { breakdown } from '@/lib/analytics';
import { bet } from './helpers';
import { countBets, groupRows, withWholeGroups } from '@/lib/dutch';
import { canBank, chainSummary, collapseRollovers, neededOdds, needsText, SHOT_TARGET, TIERS, tierOf } from '@/lib/rollover';
import { cumulativeProfit, summarize } from '@/lib/stats';
import { dayGroups } from '@/lib/table';
import { tabBets, tabDays } from '@/lib/view';
import { validateBet } from '@/lib/validate';
import { parseImport, buildExport } from '@/lib/transfer';
import type { Bet } from '@/lib/types';

const at = (i: number) => `2026-11-20T12:00:0${i}.000Z`;
/** A chain: the first bet's stake, then each next stake = the previous payout. */
function chain(id: string, legs: Partial<Bet>[], first = 100): Bet[] {
  let stake = first;
  return legs.map((over, i) => {
    const b = bet({ rolloverId: id, stake, odds: 2, result: 'won', createdAt: at(i), betText: `leg ${i + 1}`, ...over });
    stake = Math.round(b.stake * b.odds * 100) / 100;
    return b;
  });
}

describe('chain summary', () => {
  it("owner's example: 100 @ 1.60 won, 160 @ 1.20 won = one 1.92 shot paying 192", () => {
    const c = chain('r1', [{ odds: 1.6 }, { odds: 1.2 }]);
    expect(c[1]!.stake).toBe(160);
    const s = chainSummary(c);
    expect(s.stake).toBe(100);
    expect(s.odds).toBeCloseTo(1.92, 10);
    expect(s.outcome).toBe('won');
    expect(s.profit).toBe(92);
  });

  it('banked (open): pending for counts, payout not profit yet, needs 1.13+ to reach 1.80', () => {
    const c = chain('r1', [{ odds: 1.6, banked: true }]);
    const s = chainSummary(c);
    expect(s.outcome).toBe('open');
    expect(s.profit).toBe(0);
    expect(s.banked).toBe(160);
    expect(s.needs).toBe(1.13);
    expect(needsText(s)).toBe('needs 1.13+ to reach 1.80 (Shot)');
  });

  it('a later bet pending → pending; lost → lost the first stake only', () => {
    expect(chainSummary(chain('r', [{ odds: 1.6, banked: true }, { odds: 1.2, result: 'pending' }])).outcome).toBe('pending');
    const lost = chainSummary(chain('r', [{ odds: 1.6, banked: true }, { odds: 1.2, result: 'lost' }]));
    expect(lost.outcome).toBe('lost');
    expect(lost.profit).toBe(-100);
  });

  it('a void counts 1.00; a cash-out ends the chain with its amount', () => {
    const v = chainSummary(chain('r', [{ odds: 1.6, banked: true }, { odds: 1.5, result: 'void' }]));
    expect(v.odds).toBeCloseTo(1.6, 10);
    expect(v.outcome).toBe('won');
    expect(v.profit).toBe(60);
    const c = chainSummary(chain('r', [{ odds: 1.6, banked: true }, { odds: 1.5, result: 'cash-out', cashout: 200 }]));
    expect(c.outcome).toBe('won');
    expect(c.profit).toBe(100);
    expect(c.odds).toBeCloseTo(2, 10);
    const below = chainSummary(chain('r', [{ odds: 1.6, banked: true }, { odds: 1.5, result: 'cash-out', cashout: 80 }]));
    expect(below.outcome).toBe('lost');
    expect(below.profit).toBe(-20);
  });

  it('only the last bet being banked keeps the shot open (deleting an added leg reopens it)', () => {
    const c = chain('r', [{ odds: 1.6, banked: true }, { odds: 1.2 }]);
    expect(chainSummary(c).outcome).toBe('won');
    expect(chainSummary([c[0]!]).outcome).toBe('open');
  });
});

describe('needed odds and tiers', () => {
  it('rounds UP to 2 decimals and never asks for less than the target', () => {
    expect(neededOdds(1.6)).toBe(1.13); // 1.125
    expect(neededOdds(1.4)).toBe(1.29); // 1.2857
    expect(neededOdds(1.5)).toBe(1.2); // exactly 1.20, not 1.21
    expect(neededOdds(1.79)).toBe(1.01);
    expect(neededOdds(1.8)).toBeNull();
    expect(neededOdds(2.1)).toBeNull();
    for (const o of [1.11, 1.37, 1.55, 1.62, 1.7]) expect(o * neededOdds(o)!).toBeGreaterThanOrEqual(SHOT_TARGET - 1e-9);
  });

  it('Mini 1.10–1.32 · Semi 1.33–1.50 · Pepsi 1.51–1.79 · Shot 1.80+, none under 1.10', () => {
    expect(TIERS.map((t) => t.name)).toEqual(['Mini', 'Semi', 'Pepsi', 'Shot']);
    expect(TIERS.map((t) => t.name)).not.toContain('Major');
    expect(tierOf(1.09)).toBeNull();
    expect(tierOf(1.1)).toBe('Mini');
    expect(tierOf(1.32)).toBe('Mini');
    expect(tierOf(1.33)).toBe('Semi');
    expect(tierOf(1.5)).toBe('Semi');
    expect(tierOf(1.51)).toBe('Pepsi');
    expect(tierOf(1.79)).toBe('Pepsi');
    expect(tierOf(1.8)).toBe('Shot');
    expect(tierOf(1.92)).toBe('Shot');
  });

  it('a 1.40 shot shows "needs 1.29+ for a Shot"', () => {
    expect(needsText({ needs: neededOdds(1.4) })).toBe('needs 1.29+ to reach 1.80 (Shot)');
    expect(needsText({ needs: null })).toBe('already 1.80+ (Shot)');
  });
});

describe('a chain is ONE bet in counts and one money item', () => {
  const other = bet({ stake: 50, odds: 2, result: 'lost' });

  it('won chain: 1 bet, 1 win; wagered = first stake only; net = payout − first stake', () => {
    const c = chain('r1', [{ odds: 1.6 }, { odds: 1.2 }]);
    const s = summarize([...c, other]);
    expect(s.betCount).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.totalWagered).toBe(150);
    expect(s.settledStake).toBe(150);
    expect(s.netProfit).toBe(92 - 50);
    expect(s.roi).toBeCloseTo(42 / 150, 10);
  });

  it('open shot: pending (count and first stake), its banked payout not counted as profit', () => {
    const c = chain('r1', [{ odds: 1.6, banked: true }]);
    const s = summarize(c);
    expect(s.betCount).toBe(1);
    expect(s.pendingCount).toBe(1);
    expect(s.pendingAmount).toBe(100);
    expect(s.netProfit).toBe(0);
    expect(s.wins).toBe(0);
    expect(s.winRate).toBeNull();
    expect(countBets(c)).toEqual({ count: 1, pending: 1, wins: 0, losses: 0 });
  });

  it('lost chain: one loss of the first stake', () => {
    const c = chain('r1', [{ odds: 1.6, banked: true }, { odds: 1.2, result: 'lost' }]);
    const s = summarize(c);
    expect(s).toMatchObject({ betCount: 1, losses: 1, wins: 0, netProfit: -100, totalWagered: 100 });
  });

  it('collapse is stable and the profit chart counts the chain once', () => {
    const c = chain('r1', [{ odds: 1.6 }, { odds: 1.2, gameDate: '2026-11-21', placedDate: '2026-11-21' }]);
    const once = collapseRollovers(c);
    expect(once).toHaveLength(1);
    expect(collapseRollovers(once)).toEqual(once);
    expect(cumulativeProfit(c)).toEqual([{ date: '2026-11-21', profit: 92, cumulative: 92 }]);
  });

  it('analytics: one row entry under type "Rollover" at the chain odds', () => {
    const c = chain('r1', [{ odds: 1.6 }, { odds: 1.2 }]);
    expect(breakdown(c, 'type')[0]).toMatchObject({ label: 'Rollover', bets: 1, wins: 1, wagered: 100, profit: 92 });
  });
});

describe('table rows', () => {
  it('a chain is one row at its newest bet, under its newest date; the day total is its net', () => {
    const c = chain('r1', [{ odds: 1.6 }, { odds: 1.2, placedDate: '2026-11-21' }]);
    const plain = bet({ placedDate: '2026-11-21' });
    const rows = groupRows([c[1]!, plain, c[0]!]);
    expect(rows.map((r) => r.kind)).toEqual(['rollover', 'bet']);
    const days = dayGroups(rows);
    expect(days).toHaveLength(1);
    expect(days[0]!.count).toBe(2);
    expect(days[0]!.nets).toEqual([{ money: 'real', value: 92 }]);
  });

  it('the Pending tab shows an open shot; filters keep a chain whole', () => {
    const open = chain('r1', [{ odds: 1.6, banked: true }]);
    const closed = chain('r2', [{ odds: 1.6 }, { odds: 1.2 }]);
    const rows = tabDays([...open, ...closed], 'pending', '2026-11-23').flatMap((d) => d.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind === 'rollover' && rows[0]!.rolloverId).toBe('r1');
    expect(withWholeGroups(closed, [closed[1]!]).map((b) => b.id)).toEqual(closed.map((b) => b.id));
  });

  it('To settle shows the shot of a pending bet that is due', () => {
    const c = chain('r1', [{ odds: 1.6, banked: true }, { odds: 1.2, result: 'pending' }]);
    const rows = tabDays(c, 'settle', '2026-11-23').flatMap((d) => d.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('rollover');
  });
});

describe('bank rules, validation, export', () => {
  it('a won bet (a dutch split too), or the won last bet of a closed chain, can be banked', () => {
    expect(canBank(bet({ result: 'won' }))).toBe(true);
    expect(canBank(bet({ result: 'pending' }))).toBe(false);
    expect(canBank(bet({ result: 'won', dutchId: 'd' }))).toBe(true);
    expect(canBank(bet({ result: 'lost', dutchId: 'd' }))).toBe(false);
    const c = chain('r', [{ odds: 1.6, banked: true }, { odds: 1.2 }]);
    expect(canBank(c[0]!, c)).toBe(false);
    expect(canBank(c[1]!, c)).toBe(true);
  });

  it('validation keeps rollover id and banked; banked needs a chain; a dutch split can start one, not a ladder', () => {
    const base = { stake: 10, odds: 2, result: 'won', placedDate: '2026-11-20', legs: [] };
    expect(validateBet({ ...base, rolloverId: 'ro-1', banked: true })).toMatchObject({ ok: true, value: { rolloverId: 'ro-1', banked: true } });
    expect(validateBet({ ...base, banked: true })).toMatchObject({ ok: true, value: { rolloverId: null, banked: false } });
    expect(validateBet({ ...base, rolloverId: 'bad id!' }).ok).toBe(false);
    expect(validateBet({ ...base, rolloverId: 'ro-1', dutchId: 'd1', banked: true })).toMatchObject({ ok: true, value: { rolloverId: 'ro-1', dutchId: 'd1', banked: true } });
    expect(validateBet({ ...base, rolloverId: 'ro-1', dutchId: 'd1', ladder: { taken: false } }).ok).toBe(false);
  });

  it('export / import carry rolloverId and banked', () => {
    const c = chain('ro-7', [{ odds: 1.6, banked: true }]);
    const back = parseImport(JSON.parse(JSON.stringify(buildExport(c, '0.21.0'))));
    expect(back.ok && back.bets[0]!.input).toMatchObject({ rolloverId: 'ro-7', banked: true });
  });
});

describe("a dutch split's win banked for a rollover", () => {
  // dutch: A R$ 50 @ 2.00 won (pays 100), B R$ 50 @ 2.20 lost; A banked, then R$ 100 @ 1.50 on the shot
  const A = bet({ id: 'A', dutchId: 'd1', rolloverId: 'ro-d', banked: true, stake: 50, odds: 2, result: 'won', createdAt: at(0) });
  const B = bet({ id: 'B', dutchId: 'd1', stake: 50, odds: 2.2, result: 'lost', createdAt: at(1) });
  const leg2 = (result: Bet['result']) => bet({ id: 'L2', rolloverId: 'ro-d', stake: 100, odds: 1.5, result, createdAt: at(2) });

  it("open: the dutch and its shot are ONE pending bet; the split's payout is not profit yet", () => {
    expect(countBets([A, B])).toEqual({ count: 1, pending: 1, wins: 0, losses: 0 });
    const s = summarize([A, B]);
    expect(s.totalWagered).toBe(100);
    expect(s.pendingAmount).toBe(50);
    expect(s.netProfit).toBe(-50);
    expect(chainSummary([A]).banked).toBe(100);
  });

  it('the dutch keeps its split and the shot gets its own row starting from it', () => {
    const rows = groupRows([leg2('pending'), B, A]);
    expect(rows.map((r) => r.kind)).toEqual(['rollover', 'dutch']);
    expect(rows[0]!.kind === 'rollover' && rows[0]!.bets.map((b) => b.id)).toEqual(['A', 'L2']);
    expect(rows[1]!.kind === 'dutch' && rows[1]!.bets.map((b) => b.id)).toEqual(['A', 'B']);
  });

  it('shot won: one win, net = shot profit + the other splits (100 + -50)', () => {
    const bets = [A, B, leg2('won')];
    expect(countBets(bets)).toEqual({ count: 1, pending: 0, wins: 1, losses: 0 });
    expect(summarize(bets)).toMatchObject({ totalWagered: 100, netProfit: 50, betCount: 1, winRate: 1 });
  });

  it('shot lost: one loss of the whole dutch stake', () => {
    const bets = [A, B, leg2('lost')];
    expect(countBets(bets)).toEqual({ count: 1, pending: 0, wins: 0, losses: 1 });
    expect(summarize(bets).netProfit).toBe(-100);
  });

  it('the stats strip counts the split once though it shows in two rows', () => {
    const days = tabDays([leg2('won'), B, A], 'all', '2026-11-20');
    expect(summarize(tabBets(days))).toMatchObject({ betCount: 1, netProfit: 50, totalWagered: 100 });
  });
});
