'use client';

import { useEffect, useRef, useState } from 'react';
import { betLabel } from '@/lib/dutch';
import { formatOdds } from '@/lib/money';
import { sharedLegOf, dutchQueue, type DutchRowAction } from '@/lib/settle';
import type { Bet } from '@/lib/types';

const BTN = 'rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap';
const WON = `${BTN} hover:bg-emerald-600/40 text-emerald-400`;
const LOST = `${BTN} hover:bg-red-600/40 text-red-400`;
const VOID = `${BTN} hover:bg-zinc-600/40 text-zinc-300`;

/** One-click settle buttons on a pending dutch row (BT-10): 0 W, All W, Pick W…, Shared ✕, V. */
export function DutchSettleButtons({ dutchId, bets, onSettle }: { dutchId: string; bets: Bet[]; onSettle(action: DutchRowAction): void }) {
  const item = dutchQueue(dutchId, bets)[0]!;
  const pending = item.kind === 'dutch' ? item.pending : [];
  const shared = sharedLegOf(item);
  const [picking, setPicking] = useState(false);
  if (!pending.length) return null;
  return (
    <span className="relative inline-flex gap-0.5" data-testid="dutch-settle">
      <button className={LOST} title="0 won: every split lost" aria-label="Dutch: none won" onClick={() => onSettle('none')}>
        0 W
      </button>
      <button className={WON} title="All won: every split won" aria-label="Dutch: all won" onClick={() => onSettle('all')}>
        All W
      </button>
      {pending.length >= 2 && (
        <button className={WON} title="Pick which splits won (the rest lost)" aria-label="Dutch: pick winners" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
          Pick W…
        </button>
      )}
      {!('error' in shared) && (
        <button className={LOST} title={`Shared leg lost (${shared.name}): every split lost, that leg marked lost on each`} aria-label="Dutch: shared leg lost" onClick={() => onSettle('shared')}>
          Shared ✕
        </button>
      )}
      <button className={VOID} title="Void: every split void" aria-label="Dutch: void all" onClick={() => onSettle('void')}>
        V
      </button>
      {picking && (
        <PickWinners
          pending={pending}
          onClose={() => setPicking(false)}
          onPick={(w) => {
            setPicking(false);
            onSettle(w);
          }}
        />
      )}
    </span>
  );
}

/** The splits that won: two splits = one button each; more = a checkbox each, Enter or Save. */
function PickWinners({ pending, onPick, onClose }: { pending: Bet[]; onPick(winners: number[]): void; onClose(): void }) {
  const [checked, setChecked] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button, input')?.focus();
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close.current();
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const name = (b: Bet) => `${betLabel(b)} @${formatOdds(b.odds)}`;
  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Which splits won"
      className="absolute right-0 top-full z-30 mt-1 w-72 space-y-2 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-left text-xs shadow-xl"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === 'Enter' && pending.length > 2) {
          e.preventDefault();
          onPick(checked);
        }
      }}
    >
      <div className="text-zinc-400">Which won? The rest lost.</div>
      {pending.length === 2 ? (
        pending.map((b, i) => (
          <button key={b.id} className="btn w-full justify-start whitespace-normal text-left text-xs text-emerald-300" onClick={() => onPick([i])}>
            {betLabel(b)} won
          </button>
        ))
      ) : (
        <>
          {pending.map((b, i) => (
            <label key={b.id} className="flex items-center gap-2 text-zinc-200">
              <input type="checkbox" checked={checked.includes(i)} onChange={(e) => setChecked((c) => (e.target.checked ? [...c, i].sort((x, y) => x - y) : c.filter((x) => x !== i)))} />
              {name(b)}
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button className="btn text-xs" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary text-xs" onClick={() => onPick(checked)}>
              Save
            </button>
          </div>
        </>
      )}
    </div>
  );
}
