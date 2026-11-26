import { describe, expect, it } from 'vitest';
import { breakdown, MIXED, NO_LABEL } from '@/lib/analytics';
import { bet } from './helpers';

const rowsOf = (rows: ReturnType<typeof breakdown>) => rows.map((r) => [r.label, r.bets]);

describe('BT-64 breakdown by no brainer', () => {
  it('two rows, No brainer first; a dutch counts once by its own mark', () => {
    const bets = [
      bet({ noBrainer: true, result: 'won' }),
      bet({ result: 'lost' }),
      bet(),
      bet({ dutchId: 'd', noBrainer: true }),
      bet({ dutchId: 'd', noBrainer: true }),
    ];
    expect(rowsOf(breakdown(bets, 'noBrainer'))).toEqual([
      ['No brainer', 2],
      ['Other', 2],
    ]);
  });

  it('a dutch with only some bets marked counts as a no brainer, whole', () => {
    const bets = [bet({ dutchId: 'd', noBrainer: true }), bet({ dutchId: 'd' })];
    expect(rowsOf(breakdown(bets, 'noBrainer'))).toEqual([['No brainer', 1]]);
  });
});

describe('BT-64 breakdown by label', () => {
  it('one row per label, case-insensitive, shown as the chip shows it; No label last', () => {
    const bets = [bet({ label: 'lost by one' }), bet({ label: 'Lost By One' }), bet({ label: 'trap' }), bet(), bet(), bet()];
    expect(rowsOf(breakdown(bets, 'label'))).toEqual([
      ['LOST BY ONE', 2],
      ['TRAP', 1],
      [NO_LABEL, 3],
    ]);
  });

  it('a dutch or rollover whose bets carry different labels is Mixed; the same label is that label', () => {
    const bets = [
      bet({ dutchId: 'd1', label: 'a' }),
      bet({ dutchId: 'd1', label: 'b' }),
      bet({ dutchId: 'd2', label: 'a' }),
      bet({ dutchId: 'd2', label: 'A' }),
      bet({ rolloverId: 'r', banked: true, result: 'won', label: 'a', placedDate: '2026-11-19' }),
      bet({ rolloverId: 'r', label: '' }),
    ];
    expect(rowsOf(breakdown(bets, 'label'))).toEqual([
      [MIXED, 2],
      ['A', 1],
    ]);
  });
});
