// BT-47: a bet's description in the Bets table.
import { describe, expect, it } from 'vitest';
import { descriptionChanges, descriptionParts, filledSlots, hasDescription, isDescriptionOpen, linkParts, nextSlot, notesOf, rowHasDescription, startSlot } from '@/lib/descriptions';
import { validateBet } from '@/lib/validate';
import { bet, dutchBets } from './helpers';

describe('has a description', () => {
  it('plain bet: either text, blank space does not count', () => {
    expect(hasDescription(bet())).toBe(false);
    expect(hasDescription(bet({ preAnalysis: '  \n ' }))).toBe(false);
    expect(hasDescription(bet({ preAnalysis: 'Jokic vs a weak front court' }))).toBe(true);
    expect(hasDescription(bet({ postAnalysis: 'lost by one' }))).toBe(true);
  });
  it('a dutch / rollover row: when any of its bets has one', () => {
    expect(rowHasDescription(dutchBets('d', [{}, {}]))).toBe(false);
    expect(rowHasDescription(dutchBets('d', [{}, { postAnalysis: 'x' }]))).toBe(true);
  });
  it('parts: only the ones with text, Pre, Live then Post', () => {
    expect(descriptionParts(bet({ postAnalysis: ' after ' }))).toEqual([{ label: 'Post', slot: 'post', text: 'after' }]);
    expect(descriptionParts(bet({ preAnalysis: 'a', liveAnalysis: 'l', postAnalysis: 'b' })).map((p) => p.label)).toEqual(['Pre', 'Live', 'Post']);
  });
  it('a Live note alone is a description', () => {
    expect(hasDescription(bet({ liveAnalysis: 'down 10 at the half' }))).toBe(true);
  });
});

describe('open rows and saving', () => {
  it('the switch opens every row with text; a hand toggle flips one row', () => {
    const none = new Set<string>();
    expect(isDescriptionOpen('bet:a', true, false, none)).toBe(false);
    expect(isDescriptionOpen('bet:a', true, true, none)).toBe(true);
    expect(isDescriptionOpen('bet:b', false, true, none)).toBe(false);
    expect(isDescriptionOpen('bet:b', false, true, new Set(['bet:b']))).toBe(true);
    expect(isDescriptionOpen('bet:a', true, true, new Set(['bet:a']))).toBe(false);
  });
  it('only changed texts are saved, trimmed', () => {
    const a = bet({ id: 'a', preAnalysis: 'old' });
    const b = bet({ id: 'b' });
    expect(descriptionChanges([a, b], { a: { preAnalysis: 'old ', liveAnalysis: '', postAnalysis: '' }, b: { preAnalysis: '', liveAnalysis: ' live ', postAnalysis: ' new ' } })).toEqual([{ id: 'b', patch: { preAnalysis: '', liveAnalysis: 'live', postAnalysis: 'new' } }]);
  });
});

describe('BT-52: Before / After become Pre / Post', () => {
  it('a bet saved before BT-52 (no Live field): Before is Pre, After is Post, Live empty; nothing lost', () => {
    const old = { preAnalysis: 'why I bet', postAnalysis: 'what happened' };
    expect(notesOf(old)).toEqual({ preAnalysis: 'why I bet', liveAnalysis: '', postAnalysis: 'what happened' });
    expect(descriptionParts(old)).toEqual([
      { label: 'Pre', slot: 'pre', text: 'why I bet' },
      { label: 'Post', slot: 'post', text: 'what happened' },
    ]);
    expect(filledSlots([old])).toEqual(['pre', 'post']);
  });
  it('an old export (no liveAnalysis) imports with its two texts kept and Live empty', () => {
    const v = validateBet({ placedDate: '2026-11-01', stake: 10, odds: 2, result: 'pending', preAnalysis: 'before text', postAnalysis: 'after text', legs: [] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toMatchObject({ preAnalysis: 'before text', liveAnalysis: '', postAnalysis: 'after text' });
  });
});

describe('BT-52: slots', () => {
  it('opens on the last filled slot, Pre when empty', () => {
    expect(startSlot([bet()])).toBe('pre');
    expect(startSlot([bet({ preAnalysis: 'a' })])).toBe('pre');
    expect(startSlot([bet({ preAnalysis: 'a', liveAnalysis: 'b' })])).toBe('live');
    expect(startSlot([bet({ liveAnalysis: 'b' }), bet({ postAnalysis: 'c' })])).toBe('post');
  });
  it('the switch goes Pre → Live → Post → Pre', () => {
    expect([nextSlot('pre'), nextSlot('live'), nextSlot('post')]).toEqual(['live', 'post', 'pre']);
  });
});

describe('BT-52: links in a note', () => {
  it('web addresses are cut out, a closing full stop is not part of one', () => {
    expect(linkParts('see https://www.sofascore.com/x/123. then')).toEqual([{ text: 'see ' }, { text: 'https://www.sofascore.com/x/123', url: 'https://www.sofascore.com/x/123' }, { text: '. then' }]);
    expect(linkParts('no link here')).toEqual([{ text: 'no link here' }]);
    expect(linkParts('http://a.b/c')).toEqual([{ text: 'http://a.b/c', url: 'http://a.b/c' }]);
  });
});
