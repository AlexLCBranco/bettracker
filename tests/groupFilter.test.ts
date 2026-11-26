import { describe, expect, it } from 'vitest';
import { breakdown, DIMENSIONS } from '@/lib/analytics';
import { countBets } from '@/lib/dutch';
import { dutchStats } from '@/lib/dutchStats';
import { applyGroups, groupHref, matchGroup, parseGroups, withoutGroup } from '@/lib/groupFilter';
import { bet, leg } from './helpers';

// a mix: sports and markets set / not set / mixed, books, odds in every band, dutches, a rollover shot, labels, marks
const bets = [
  bet({ odds: 1.05, book: '', legs: [leg({ sport: '', market: '' })] }),
  bet({ odds: 1.2, result: 'won', label: 'trap', noBrainer: true }),
  bet({ odds: 1.4, result: 'lost', situation: 'live', legs: [leg({ sport: 'Football', market: 'BTTS' })] }),
  bet({ odds: 1.6, type: 'combination', result: 'won', legs: [leg({ sport: 'Football' }), leg({ sport: 'Tennis' })] }),
  bet({ odds: 1.9, result: 'won', label: 'Trap' }),
  bet({ odds: 2.5, book: 'Betano' }),
  bet({ odds: 6, result: 'lost' }),
  bet({ dutchId: 'd1', odds: 2, result: 'won', label: 'x' }),
  bet({ dutchId: 'd1', odds: 3, result: 'lost', label: 'y', legs: [leg({ market: 'Draw' })] }),
  bet({ dutchId: 'd2', odds: 3, noBrainer: true }),
  bet({ dutchId: 'd2', odds: 3, noBrainer: true }),
  bet({ dutchId: 'd2', odds: 3, noBrainer: true }),
  bet({ rolloverId: 'r1', banked: true, result: 'won', odds: 1.3, placedDate: '2026-11-18' }),
  bet({ rolloverId: 'r1', result: 'won', odds: 1.5, stake: 130, placedDate: '2026-11-19' }),
];

describe('BT-66 group filters select what the Analytics row counted', () => {
  for (const d of DIMENSIONS)
    it(`every ${d} row`, () => {
      const rows = breakdown(bets, d);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const shown = applyGroups(bets, [{ kind: d, key: r.key }]);
        expect([r.label, countBets(shown).count]).toEqual([r.label, r.bets]);
        expect(matchGroup(bets, { kind: d, key: r.key }).label).not.toBe('');
      }
    });

  it('the dutch tables', () => {
    const s = dutchStats(bets);
    for (const r of s.bySplits) expect(countBets(applyGroups(bets, [{ kind: 'dutchSplits', key: r.key }])).count).toBe(r.bets);
    for (const r of s.byOdds) expect(countBets(applyGroups(bets, [{ kind: 'dutchOdds', key: r.key }])).count).toBe(r.bets);
  });

  it('a Shot sub-row selects only its range; the Shot row all of them', () => {
    expect(countBets(applyGroups(bets, [{ kind: 'odds', key: 'Shot:5.00+' }])).count).toBe(1);
    expect(matchGroup(bets, { kind: 'odds', key: 'Shot:5.00+' }).label).toBe('Shot 5.00+');
    expect(matchGroup(bets, { kind: 'odds', key: 'Shot' }).label).toBe('Shot 1.80+');
  });

  it('one bet by id', () => {
    expect(applyGroups(bets, [{ kind: 'bet', key: bets[2]!.id }]).map((b) => b.id)).toEqual([bets[2]!.id]);
  });
});

describe('BT-66 addresses', () => {
  it('round trip, special keys readable', () => {
    const href = groupHref([{ kind: 'sport', key: '\u0000not-set' }, { kind: 'noBrainer', key: 'nb' }]);
    expect(href).toBe('/?sport=%7Enot-set&nb=nb');
    expect(parseGroups(new URLSearchParams(href.slice(2)))).toEqual([
      { kind: 'sport', key: '\u0000not-set' },
      { kind: 'noBrainer', key: 'nb' },
    ]);
    expect(withoutGroup(new URLSearchParams('sport=a&tab=settle'), 'sport')).toBe('/?tab=settle');
  });
});

describe('BT-66 typed addresses', () => {
  it('text keys ignore case and accents', () => {
    expect(countBets(applyGroups(bets, [{ kind: 'sport', key: 'FOOTBALL' }])).count).toBe(1);
    expect(countBets(applyGroups(bets, [{ kind: 'label', key: 'TRAP' }])).count).toBe(2);
  });
});
