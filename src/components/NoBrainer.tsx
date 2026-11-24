'use client';

import { useApp } from './AppProvider';
import type { Bet } from '@/lib/types';

// BT-44: the "no brainer" mark. Violet, not yellow: amber / yellow already means a partial result, a label and "woulda
// won" (src/lib/tone.ts). The colour lives here only: change NB_TINT and the chip's classes to restyle it.

/** The bet cell's tint. A background only: no change in row height, widths or alignment. */
export const NB_TINT = 'bg-violet-500/[0.13]';

export const isNoBrainer = (bets: Pick<Bet, 'noBrainer'>[]) => bets.some((b) => b.noBrainer);

export function NoBrainerChip() {
  return (
    <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-violet-500/25 px-1 align-[1px] text-[10px] font-bold uppercase leading-4 tracking-wide text-violet-200" title="No brainer" data-testid="no-brainer-chip">
      No brainer
    </span>
  );
}

/** Turns the mark on or off for a row's bets (a dutch: all its bets), as one undo step. */
export function useToggleNoBrainer() {
  const { update, undoGroup } = useApp();
  return (bets: Bet[]) => {
    const on = !isNoBrainer(bets);
    return undoGroup(on ? 'Marked no brainer' : 'No brainer removed', undefined, () => Promise.all(bets.map((b) => update(b.id, { noBrainer: on }, {}).catch(() => undefined))));
  };
}

/** The row's one-click toggle, next to "+ label / result". */
export function NoBrainerButton({ bets }: { bets: Bet[] }) {
  const toggle = useToggleNoBrainer();
  const on = isNoBrainer(bets);
  return (
    <button
      className={`whitespace-nowrap rounded px-0.5 py-0.5 text-[11px] hover:bg-zinc-800 ${on ? 'text-violet-300 hover:text-white' : 'text-zinc-500 hover:text-white'}`}
      title={on ? 'Remove the no brainer mark (X)' : 'Mark as a no brainer (X)'}
      aria-label={on ? 'Remove no brainer' : 'Mark no brainer'}
      aria-pressed={on}
      data-testid="toggle-no-brainer"
      onClick={(e) => {
        e.stopPropagation();
        void toggle(bets);
      }}
    >
      NB
    </button>
  );
}
