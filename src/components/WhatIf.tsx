'use client';

// BT-49: "what if" on a banked shot. Type a possible next-leg odd (or several, split by ";" or new lines) and see the
// final odds, tier, payout and profit against the first stake. Nothing is saved: Enter (or Place) opens "+ Add leg"
// with that odd filled in; Esc closes.
import { useEffect, useRef, useState } from 'react';
import { formatMoney, formatOdds, oddsFromText } from '@/lib/money';
import { needsText, whatIf, whatIfLines, type ShotNow, type WhatIf } from '@/lib/rollover';
import type { Money } from '@/lib/types';
import { formatUnits } from '@/lib/units';
import { useUnitsView } from './Money';

/** One "what if" result: "@ 1.20 → 1.86 SHOT · pays R$ 186,00 · +R$ 86,00" (units when the $ | u switch is on). */
export function WhatIfResult({ r, money, unitSize, showNext = true }: { r: WhatIf; money: Money; unitSize: number | null; showNext?: boolean }) {
  const [unitsView] = useUnitsView();
  const u = unitsView && unitSize && unitSize > 0 ? unitSize : null;
  const amount = (n: number, signed = false) => (u ? formatUnits(n / u, signed) : formatMoney(n, money, signed));
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums" data-testid="whatif-result">
      {showNext && <span className="text-zinc-500">@ {formatOdds(r.next, 2)} →</span>}
      <span className="font-semibold text-zinc-100" data-testid="whatif-odds">
        {formatOdds(r.odds, 2)}
      </span>
      {r.tier && (
        <span className="rounded bg-sky-500/15 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-sky-200" data-testid="whatif-tier">
          {r.tier}
        </span>
      )}
      <span className="text-zinc-400">
        · pays <span className="text-zinc-200" data-testid="whatif-payout">{amount(r.payout)}</span>
      </span>
      <span className="text-zinc-400">
        ·{' '}
        <span className={r.profit > 0 ? 'text-emerald-400' : r.profit < 0 ? 'text-red-400' : 'text-zinc-400'} data-testid="whatif-profit">
          {amount(r.profit, true)}
        </span>
      </span>
    </span>
  );
}

/** The live preview under "+ Add leg"'s odds box: the shot it would make. Nothing when the odds cannot be read. */
export function WhatIfPreview({ shot, odds, money, unitSize }: { shot: ShotNow; odds: string; money: Money; unitSize: number | null }) {
  const next = oddsFromText(odds);
  if (next == null) return null;
  return (
    <p className="text-xs text-sky-200" data-testid="whatif-preview">
      If it wins: <WhatIfResult r={whatIf(shot, next)} money={money} unitSize={unitSize} showNext={false} />
    </p>
  );
}

/** The "what if" box: odds in, one result line per odd typed. */
export function WhatIfPanel({ shot, needs, money, unitSize, onPlace, onClose }: { shot: ShotNow; needs: number | null; money: Money; unitSize: number | null; onPlace(next: number): void; onClose(): void }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  const lines = whatIfLines(text, shot, oddsFromText);
  const readable = lines.filter((l) => l.result);
  const one = readable.length === 1 ? readable[0]!.result! : null;
  return (
    <div className="space-y-1.5 text-xs" data-testid="whatif" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sky-300">What if</span>
        <textarea
          ref={box}
          rows={Math.min(4, Math.max(1, text.split('\n').length))}
          className="field w-48 resize-none py-0.5 font-mono text-xs"
          placeholder="1.20; 1,3; -500"
          aria-label="What if: next leg odds"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              if (one) onPlace(one.next);
            }
          }}
          data-testid="whatif-input"
        />
        <span className="text-zinc-500" data-testid="whatif-needs">
          {needsText({ needs })}
        </span>
        <button type="button" className="ml-auto rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-white" onClick={onClose} title="Close (Esc)" aria-label="Close what if">
          ✕
        </button>
      </div>
      {lines.length > 0 && (
        <ul className="space-y-0.5" data-testid="whatif-lines">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2" data-testid="whatif-line">
              {l.result ? (
                <>
                  <WhatIfResult r={l.result} money={money} unitSize={unitSize} />
                  <button type="button" className="rounded px-1.5 py-0.5 font-semibold text-sky-300 hover:bg-sky-600/30" onClick={() => onPlace(l.result!.next)} data-testid="whatif-place">
                    Place this leg
                  </button>
                </>
              ) : (
                <span className="text-red-400">Cannot read &quot;{l.text}&quot;</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {readable.length > 1 && <p className="text-zinc-500">Several odds: Place the one you want (Enter places when there is one).</p>}
    </div>
  );
}

/** Which banked shot's "what if" box is open in the table (one at a time), by chain id. */
export interface WhatIfControl {
  openId: string | null;
  toggle(rolloverId: string): void;
  close(): void;
}
