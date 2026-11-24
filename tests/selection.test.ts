// BT-45: selecting several rows of the Bets table.
import { describe, expect, it } from 'vitest';
import { groupRows } from '@/lib/dutch';
import { bulkSettleable, rangeKeys, selectedRows, selectionTotals, toggleKey, topKey } from '@/lib/selection';
import { bet, dutchBets, leg } from './helpers';

const keys = ['bet:a', 'dutch:d1', 'bet:b', 'rollover:r1', 'bet:c'];

describe('selection maths', () => {
  it('range: from the last clicked row to this one, either direction', () => {
    expect(rangeKeys(keys, 'bet:a', 'bet:b')).toEqual(['bet:a', 'dutch:d1', 'bet:b']);
    expect(rangeKeys(keys, 'bet:c', 'dutch:d1')).toEqual(['dutch:d1', 'bet:b', 'rollover:r1', 'bet:c']);
    expect(rangeKeys(keys, null, 'bet:b')).toEqual(['bet:b']);
    expect(rangeKeys(keys, 'bet:gone', 'bet:b')).toEqual(['bet:b']);
  });

  it('toggle adds and removes one row', () => {
    const s = toggleKey(new Set(['bet:a']), 'bet:b');
    expect([...s]).toEqual(['bet:a', 'bet:b']);
    expect([...toggleKey(s, 'bet:a')]).toEqual(['bet:b']);
  });

  it('a dutch split or a chain bet selects its whole row, never half of it', () => {
    const betOf = (id: string) => ({ s1: { dutchId: 'd1', rolloverId: null }, c1: { dutchId: null, rolloverId: 'r1' }, x: { dutchId: 'd1', rolloverId: 'r9' } })[id];
    expect(topKey(keys, 'bet:s1', betOf)).toBe('dutch:d1');
    expect(topKey(keys, 'bet:c1', betOf)).toBe('rollover:r1');
    // a shot banked from a dutch split: its chain is not a row here, so its dutch is
    expect(topKey(keys, 'bet:x', betOf)).toBe('dutch:d1');
    expect(topKey(keys, 'bet:a', betOf)).toBe('bet:a');
    expect(topKey(keys, 'bet:nope', betOf)).toBeNull();
  });
});

describe('bulk settle and totals', () => {
  const plain = bet({ id: 'p', stake: 10, odds: 2 });
  const won = bet({ id: 'w', stake: 20, odds: 1.5, result: 'won' });
  const combo = bet({ id: 'k', type: 'combination', stake: 5, odds: 4, legs: [leg(), leg()] });
  const legless = bet({ id: 'k0', type: 'combination', stake: 5, odds: 3, legs: [] });
  const dutch = dutchBets('d', [{ stake: 30, odds: 2 }, { stake: 20, odds: 3 }]);
  const chain = [bet({ id: 'r1', rolloverId: 'r', stake: 10, odds: 2, result: 'won', banked: true })];
  const rows = groupRows([plain, won, combo, legless, ...dutch, ...chain]);

  it('only pending plain bets settle in bulk; dutches, combinations with legs, rollovers and settled rows are skipped', () => {
    const r = bulkSettleable(rows);
    expect(r.bets.map((b) => b.id)).toEqual(['p', 'k0']);
    expect(r.skipped).toBe(4);
  });

  it('totals: stake of all, profit of the settled, what the pending would pay', () => {
    const t = selectionTotals(rows);
    expect(t).toMatchObject({ rows: 6, stake: 100, settledProfit: 20, settled: 2, pending: 5 });
    expect(t.pendingPays).toBe(20 + 20 + 15 + 60 + 60);
  });

  it('selectedRows keeps table order', () => {
    expect(selectedRows(rows, new Set(['bet:w', 'bet:p'])).map((r) => (r.kind === 'bet' ? r.bet.id : ''))).toEqual(['p', 'w']);
  });
});
