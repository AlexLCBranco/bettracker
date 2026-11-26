// BT-59: the keys that work on the selected row, from the same conditions the Bets page's key handler uses
// (src/app/(app)/page.tsx), so the shortcuts are not hidden behind "?".

import { canBank, chainSummary, isLadder } from './rollover';
import type { Bet } from './types';

export interface KeyHint {
  /** What is shown in the key box: "W", "1-9", "Enter". */
  keys: string;
  label: string;
  /** The key a click presses; none for a range like "1-9". */
  press?: string;
}

const h = (keys: string, label: string, press: string | null = keys.toLowerCase()): KeyHint => (press ? { keys, label, press } : { keys, label });

const SETTLE: KeyHint[] = [h('W', 'won'), h('L', 'lost'), h('V', 'void'), h('C', 'cash-out')];
const HALF: KeyHint[] = [h('H', 'half-won'), h('J', 'half-lost')];
const COMMON: KeyHint[] = [h('T', 'label'), h('D', 'description'), h('X', 'no brainer')];

/**
 * The hints for a selection key ("bet:<id>", "dutch:<id>", "rollover:<id>"), grouped (a group per " · " in the line).
 * `all` is every bet (a rollover's chain is looked up there).
 */
export function keyHints(selected: string | null, all: Bet[]): KeyHint[][] {
  if (!selected) return [];
  const byId = (id: string) => all.find((b) => b.id === id);
  const one = selected.startsWith('bet:') ? byId(selected.slice(4)) : undefined;
  const chainId = selected.startsWith('rollover:') ? selected.slice(9) : one?.rolloverId;
  const chain = chainId ? all.filter((b) => b.rolloverId === chainId) : [];
  const groups: KeyHint[][] = [];

  if (chain.length) {
    const s = chainSummary(chain);
    if (s.outcome === 'open') {
      groups.push([h('A', 'add leg'), ...(isLadder(chain) ? [] : [h('I', 'what if')]), h('B', 'close')]);
    } else {
      const last = s.bets.at(-1);
      if (last && canBank(last, chain)) groups.push([h('B', 'bank again')]);
    }
  }

  if (selected.startsWith('rollover:')) {
    if (chain.some((b) => b.result === 'pending')) groups.unshift(SETTLE);
  } else if (selected.startsWith('dutch:')) {
    const bets = all.filter((b) => b.dutchId === selected.slice(6));
    if (bets.some((b) => b.result === 'pending')) groups.push([h('1-9', 'toggle', null), h('Enter', 'confirm', 'Enter'), h('0', 'none'), h('V', 'void'), h('S', 'shared leg')]);
  } else if (one) {
    if (one.result === 'pending') groups.unshift(SETTLE, HALF);
    else if (one.result === 'cash-out') groups.unshift([h('W', 'woulda won'), h('L', 'woulda lost')]);
    if (!chain.length && canBank(one)) groups.push([h('B', 'bank')]);
  }
  groups.push(COMMON);
  return groups;
}
