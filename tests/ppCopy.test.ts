// "Copy table": every PP of the batch as a table in the PPs tab's style, plain text and HTML.
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS, type PPBatch, type PPLeg, type PPTicket } from '@/lib/pp';
import { clashText, sameGameClashes } from '@/lib/ppBuilder';
import { batchRows, batchTableHtml, batchTableText, COPY_HEADER } from '@/lib/ppCopy';

const leg = (id: string, over: Partial<PPLeg> = {}): PPLeg => ({ id, sport: 'NBA', market: 'ML', selection: id, odds: 2, tier: 'major', result: 'pending', actual: '', note: '', parts: [], ...over, game: over.game ?? `${id} game` });
const ticket = (number: number, legIds: string[], over: Partial<PPTicket> = {}): PPTicket => ({ id: `t${number}`, number, legIds, placed: true, oddsOverride: null, stake: null, ...over });
const batch = (legs: PPLeg[], tickets: PPTicket[], over: Partial<PPBatch> = {}): PPBatch => ({
  id: 'b1',
  name: 'Batch 27/11',
  placedDate: '2026-11-27',
  book: 'Bet365',
  stake: 1,
  targetOdds: 20,
  money: 'hypothetical',
  scheme: null,
  notes: '',
  tiers: DEFAULT_TIERS,
  legs,
  tickets,
  createdAt: '2026-11-27T00:00:00Z',
  updatedAt: '2026-11-27T00:00:00Z',
  ...over,
});

describe('copy a batch as a table', () => {
  const legs = [leg('Blazers ML', { odds: 2 }), leg('Chelsea G', { odds: 3 }), leg('Maxey 30 pts', { odds: 4, result: 'won' }), leg('BTTS', { result: 'lost' })];
  // out of order on purpose: the copy is by number
  const b = batch(legs, [
    ticket(2, ['Blazers ML', 'BTTS'], { stake: 2 }),
    ticket(1, ['Blazers ML', 'Chelsea G', 'Maxey 30 pts'], { placed: false, stake: 0.98 }),
    ticket(3, ['Chelsea G', 'Maxey 30 pts'], { oddsOverride: 11.5 }),
  ]);

  it('one row per PP, by number, with the cells the PPs tab shows', () => {
    expect(batchRows(b)).toEqual([
      ['PP 1 (not placed)', 'Blazers ML, Chelsea G, Maxey 30 pts', '24.00 (est.)', 'H$ 0,98', 'H$ 23,52', 'Alive (2 left)'],
      ['PP 2', 'Blazers ML, BTTS', '4.00 (est.)', 'H$ 2,00', '-H$ 2,00', 'Dead'],
      ['PP 3', 'Chelsea G, Maxey 30 pts', '11.50', 'H$ 1,00', 'H$ 11,50', 'One leg away (1 left)'],
    ]);
  });

  it('plain text: a title line, the header, then one line per PP split by " | "', () => {
    const lines = batchTableText(b).split('\n');
    expect(lines[0]).toBe('Batch 27/11 · Bet365 · 27/11/2026');
    expect(lines[1]).toBe(COPY_HEADER.join(' | '));
    expect(lines[2]).toBe('PP 1 (not placed) | Blazers ML, Chelsea G, Maxey 30 pts | 24.00 (est.) | H$ 0,98 | H$ 23,52 | Alive (2 left)');
    expect(lines).toHaveLength(5);
  });

  it('HTML: a real table, text escaped', () => {
    const html = batchTableHtml(batch([leg('<b>x & y</b>')], [ticket(1, ['<b>x & y</b>'])]));
    expect(html).toContain('<th>PP</th><th>Legs</th>');
    expect(html).toContain('<td>&lt;b&gt;x &amp; y&lt;/b&gt;</td>');
    expect(html.match(/<tr>/g)).toHaveLength(2);
  });

  it('a batch with no PPs copies only the title and header', () => expect(batchTableText(batch([], [])).split('\n')).toHaveLength(2));
});

describe('same game on one PP (a pool leg edited after the PPs were made)', () => {
  const legs = [leg('McDaniels 10 pts', { game: 'Bulls v Wolves' }), leg('Dosunmu 20 pts', { game: 'bulls  v wolves' }), leg('Chelsea G', { game: 'Chelsea v Spurs' })];
  const b = batch(legs, [ticket(2, ['McDaniels 10 pts', 'Dosunmu 20 pts', 'Chelsea G']), ticket(1, ['McDaniels 10 pts', 'Chelsea G']), ticket(3, ['Dosunmu 20 pts', 'McDaniels 10 pts'])]);

  it('finds every PP holding two legs from one game, by number', () => {
    const c = sameGameClashes(b);
    expect(c.map((x) => x.ticket.number)).toEqual([2, 3]);
    expect(c[0]!.pairs.map(([x, y]) => [x.id, y.id])).toEqual([['McDaniels 10 pts', 'Dosunmu 20 pts']]);
  });
  it('only: just the pairs with that leg', () => {
    expect(sameGameClashes(b, 'Chelsea G')).toEqual([]);
    expect(sameGameClashes(b, 'Dosunmu 20 pts')).toHaveLength(2);
  });
  it('says which legs and which PPs', () => expect(clashText(sameGameClashes(b))).toBe('McDaniels 10 pts and Dosunmu 20 pts on PP 2; Dosunmu 20 pts and McDaniels 10 pts on PP 3'));
  it('a leg with no game typed never clashes', () => expect(sameGameClashes(batch([leg('a', { game: '' }), leg('b', { game: '' })], [ticket(1, ['a', 'b'])]))).toEqual([]));
  it('a combo clashes through any of its parts', () => {
    const combo = leg('combo', { game: 'X / Bulls v Wolves', parts: [{ sport: '', date: '', game: 'X', market: '', selection: 'p1', odds: 2 }, { sport: '', date: '', game: 'Bulls v Wolves', market: '', selection: 'p2', odds: 2 }] });
    expect(sameGameClashes(batch([combo, legs[0]!], [ticket(1, ['combo', 'McDaniels 10 pts'])]))).toHaveLength(1);
  });
  it('the copied table marks those PPs', () => expect(batchRows(b).map((r) => r[0])).toEqual(['PP 1', 'PP 2 ⚠ same game', 'PP 3 ⚠ same game']));
});
