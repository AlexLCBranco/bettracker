// BT-28: leg results and bet results always agree (leg → up, bet → down, shared legs of a dutch, undo, data repair).
import { describe, expect, it } from 'vitest';
import { beforeOf, betResultChanges, legResultChanges, repairLegs, type SettleChange } from '@/lib/settle';
import type { Bet, Result } from '@/lib/types';
import { bet, leg } from './helpers';

const combo = (results: Result[], over: Partial<Bet> = {}) =>
  bet({ type: 'combination', betText: 'combo', legs: results.map((r, i) => leg({ selection: `Pick ${i + 1}`, game: `Game ${i + 1}`, result: r })), ...over });

/** Two splits sharing leg "Shared" (a combination each), like a dutch logged with a shared leg. */
function dutch(): Bet[] {
  const shared = () => leg({ selection: 'Shared', game: 'Big game' });
  return [
    bet({ type: 'combination', dutchId: 'd', betText: '', legs: [shared(), leg({ selection: 'A', game: 'G1' })] }),
    bet({ type: 'combination', dutchId: 'd', betText: '', legs: [shared(), leg({ selection: 'B', game: 'G2' })] }),
  ];
}

const apply = (bets: Bet[], cs: SettleChange[]) =>
  bets.map((b) => {
    const c = cs.find((x) => x.id === b.id);
    return c ? { ...b, result: c.result, cashout: c.cashout, legs: c.legs ? c.legs.map((l, i) => ({ ...l, id: b.legs[i]!.id })) : b.legs } : b;
  });
const legResults = (b: Bet) => b.legs.map((l) => l.result);

describe('leg → bet (rule 2)', () => {
  it('a lost leg loses its bet', () => {
    const b = combo(['pending', 'pending']);
    const [c] = legResultChanges([b], b.id, 0, 'lost');
    expect(c).toMatchObject({ id: b.id, result: 'lost' });
    expect(c!.legs!.map((l) => l.result)).toEqual(['lost', 'pending']);
  });

  it('every leg won wins the bet; one still pending leaves it pending', () => {
    const b = combo(['won', 'pending', 'pending']);
    expect(legResultChanges([b], b.id, 1, 'won')[0]).toMatchObject({ result: 'pending' });
    const b2 = combo(['won', 'won', 'pending']);
    expect(legResultChanges([b2], b2.id, 2, 'won')[0]).toMatchObject({ result: 'won' });
  });

  it('a void leg leaves the bet as it is', () => {
    const b = combo(['won', 'pending']);
    const [c] = legResultChanges([b], b.id, 1, 'void');
    expect(c!.result).toBe('pending');
    expect(c!.legs!.map((l) => l.result)).toEqual(['won', 'void']);
  });

  it('a shared leg of a dutch is set on every split; lost → every split lost', () => {
    const d = dutch();
    const cs = legResultChanges(d, d[0]!.id, 0, 'lost');
    expect(cs.map((c) => [c.id, c.result])).toEqual([
      [d[0]!.id, 'lost'],
      [d[1]!.id, 'lost'],
    ]);
    expect(apply(d, cs).map(legResults)).toEqual([
      ['lost', 'pending'],
      ['lost', 'pending'],
    ]);
  });

  it('a shared leg won is set on every split; splits stay pending until their own leg settles', () => {
    const d = dutch();
    const after = apply(d, legResultChanges(d, d[1]!.id, 0, 'won'));
    expect(after.map((b) => b.result)).toEqual(['pending', 'pending']);
    expect(after.map(legResults)).toEqual([
      ['won', 'pending'],
      ['won', 'pending'],
    ]);
  });

  it('rule 4: on a lost bet, the lost leg changed to won with every leg won → the bet is won', () => {
    const b = combo(['lost', 'won'], { result: 'lost' });
    expect(legResultChanges([b], b.id, 0, 'won')[0]).toMatchObject({ result: 'won' });
  });

  it('rule 4: the only lost leg changed to pending → the bet goes back to pending', () => {
    const b = combo(['lost', 'pending'], { result: 'lost' });
    expect(legResultChanges([b], b.id, 0, 'pending')[0]).toMatchObject({ result: 'pending' });
  });

  it('a leg changed on a won bet → the bet is no longer won', () => {
    const b = combo(['won', 'won'], { result: 'won' });
    expect(legResultChanges([b], b.id, 1, 'lost')[0]).toMatchObject({ result: 'lost' });
    expect(legResultChanges([b], b.id, 1, 'pending')[0]).toMatchObject({ result: 'pending' });
  });

  it('a lost bet whose losing leg is not known: W on a "?" leg keeps it lost and the last unknown leg is worked out', () => {
    const b = combo(['pending', 'pending'], { result: 'lost' });
    const [c] = legResultChanges([b], b.id, 0, 'won');
    expect(c!.result).toBe('lost');
    expect(c!.legs!.map((l) => l.result)).toEqual(['won', 'lost']);
  });

  it('cash-outs do not follow their legs', () => {
    const b = combo(['pending', 'pending'], { result: 'cash-out', cashout: 50 });
    expect(legResultChanges([b], b.id, 0, 'lost')[0]).toMatchObject({ result: 'cash-out', cashout: 50 });
  });

  it('undo restores every bet a leg change touched, in one step', () => {
    const d = dutch();
    const cs = legResultChanges(d, d[0]!.id, 0, 'lost');
    const back = apply(apply(d, cs), beforeOf(d, cs));
    expect(back.map((b) => [b.result, ...legResults(b)])).toEqual(d.map((b) => [b.result, ...legResults(b)]));
  });
});

describe('bet → legs (rule 3)', () => {
  it('won → every leg won (void legs stay void)', () => {
    const b = combo(['pending', 'void', 'lost']);
    expect(betResultChanges([b], b, 'won')[0]!.legs!.map((l) => l.result)).toEqual(['won', 'void', 'won']);
  });

  it('lost with no leg known → legs stay pending (shown "?"); legs known from other splits are filled in', () => {
    const b = combo(['pending', 'pending']);
    expect(betResultChanges([b], b, 'lost')).toEqual([{ id: b.id, result: 'lost', cashout: null }]);
    const d = dutch();
    d[1] = { ...d[1]!, legs: d[1]!.legs.map((l, i) => (i === 0 ? { ...l, result: 'won' as const } : l)) };
    const [c] = betResultChanges(d, d[0]!, 'lost');
    expect(c!.legs!.map((l) => l.result)).toEqual(['won', 'lost']);
  });

  it('back to pending → every leg pending', () => {
    const b = combo(['won', 'lost'], { result: 'lost' });
    const [c] = betResultChanges([b], b, 'pending');
    expect(c).toMatchObject({ result: 'pending', cashout: null });
    expect(c!.legs!.map((l) => l.result)).toEqual(['pending', 'pending']);
  });

  it('cash-out needs an amount; a change that changes nothing is dropped', () => {
    const b = combo(['pending', 'pending']);
    expect(betResultChanges([b], b, 'cash-out')).toEqual([]);
    expect(betResultChanges([b], b, 'cash-out', 30)[0]).toMatchObject({ result: 'cash-out', cashout: 30 });
    expect(betResultChanges([b], b, 'pending')).toEqual([]);
  });
});

describe('repairLegs (rule 5, bets logged before BT-28)', () => {
  it('won combinations get their pending legs won; lost ones get what can be worked out; others untouched', () => {
    const won = combo(['pending', 'won'], { result: 'won' });
    const lost = combo(['won', 'pending'], { result: 'lost' });
    const unknown = combo(['pending', 'pending'], { result: 'lost' });
    const pending = combo(['pending', 'pending']);
    const solo = bet({ result: 'won' });
    expect(repairLegs([won, lost, unknown, pending, solo]).map((f) => [f.id, f.legs.map((l) => l.result)])).toEqual([
      [won.id, ['won', 'won']],
      [lost.id, ['won', 'lost']],
    ]);
  });
});
