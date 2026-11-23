'use client';

// BT-27: the label chip, the line of losing legs, and the small inline editor (T, or "+ label / result") that sets a
// bet's label and what actually happened on each leg. Enter saves, Esc closes without saving.

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { distinctLegs, knownLegResults, parseSoloLine, planActuals, sharedLabel, soloLine, type LegEdit, type LossEntry } from '@/lib/actuals';
import { normalize } from '@/lib/autocomplete';
import type { Bet, Result } from '@/lib/types';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

/** Small uppercase chip on the bet text's line; inline-block, so it wraps whole and never adds height to the line. */
export function LabelChip({ label }: { label: string }) {
  return (
    <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-amber-400/15 px-1 align-[1px] text-[10px] font-bold uppercase leading-4 tracking-wide text-amber-300" title={`Label: ${label}`} data-testid="label-chip">
      {label}
    </span>
  );
}

/** "✗ Jokic 12+ ass 11 · ✗ Celtics ML 111-112": one entry per losing leg, under the muted line, wrapping. */
export function LossLine({ entries }: { entries: LossEntry[] }) {
  return (
    <div className="text-[11px] leading-5 [overflow-wrap:anywhere]" data-testid="loss-line">
      {entries.map((e, i) => (
        <span key={i}>
          {i > 0 && <span className="text-zinc-700"> · </span>}
          <span className="text-red-400/80">✗{' '}{e.name}</span>
          {e.actual && <span className="text-zinc-300"> {e.actual}</span>}
        </span>
      ))}
    </div>
  );
}

type Props = { kind: 'bet'; bet: Bet; group: Bet[]; onClose(): void } | { kind: 'dutch'; bets: Bet[]; onClose(): void };

interface LegField {
  betId: string;
  index: number;
  name: string;
  actual: string;
  /** Combination legs only: the result toggle (✓ / ✗ / ·), and whether it was clicked. */
  result: Result | null;
  touched: boolean;
}

const NEXT: Partial<Record<Result, Result>> = { pending: 'won', won: 'lost', lost: 'pending' };
const MARK: Partial<Record<Result, string>> = { won: '✓', lost: '✗', 'half-won': '½✓', 'half-lost': '½✗', void: '–' };

export function Annotator(props: Props) {
  const { update, suggestFor, notify } = useApp();
  const group = props.kind === 'dutch' ? props.bets : props.group;
  const soloBet = props.kind === 'bet' && props.bet.type === 'solo' ? props.bet : null;
  const initialLabel = props.kind === 'dutch' ? sharedLabel(props.bets) : props.bet.label;

  const [line, setLine] = useState(() => (soloBet ? soloLine(soloBet) : ''));
  const [label, setLabel] = useState(initialLabel);
  const [legs, setLegs] = useState<LegField[]>(() => {
    if (soloBet) return [];
    const entries = props.kind === 'dutch' ? distinctLegs(props.bets) : props.bet.legs.map((leg, index) => ({ betId: props.bet.id, index, leg }));
    return entries.map(({ betId, index, leg }) => {
      const b = group.find((x) => x.id === betId)!;
      return {
        betId,
        index,
        name: leg.selection || leg.game || `Leg ${index + 1}`,
        actual: leg.actual,
        result: b.type === 'combination' ? knownLegResults(b, group)[index]! : null,
        touched: false,
      };
    });
  });

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    let edits: LegEdit[];
    let newLabel = label;
    if (soloBet) {
      const parsed = parseSoloLine(line);
      edits = [{ betId: soloBet.id, index: 0, actual: parsed.actual }];
      newLabel = parsed.label;
    } else edits = legs.map((l) => ({ betId: l.betId, index: l.index, actual: l.actual, ...(l.touched && l.result ? { result: l.result } : {}) }));
    const labelChanged = newLabel.trim() !== initialLabel.trim();
    const labelFor = props.kind === 'dutch' ? props.bets.map((b) => b.id) : [props.bet.id];
    const plan = planActuals(group, { legs: edits, ...(labelChanged ? { label: newLabel, labelFor } : {}) });
    props.onClose();
    if (!plan.length) return;
    void Promise.all(plan.map((p) => update(p.id, p.patch)))
      .then(() => notify('Saved'))
      .catch(() => undefined);
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  };

  const labelSuggestions = (q: string) => suggestFor('label', q);
  // the solo line: "#" starts the label, which is what gets suggested (recent labels on an empty line)
  const lineSuggestions = (q: string) => {
    const i = q.indexOf('#');
    if (i < 0) return q.trim() ? [] : suggestFor('label', '').map((l) => `#${l}`);
    const before = q.slice(0, i).trim();
    return suggestFor('label', q.slice(i + 1)).filter((l) => normalize(l) !== normalize(q.slice(i + 1))).map((l) => `${before ? `${before} ` : ''}#${l}`);
  };

  return (
    <form
      role="dialog"
      aria-label="Label and actual result"
      className="mt-1 flex flex-wrap items-end gap-2 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs font-normal"
      data-testid="annotator"
      onSubmit={save}
      onKeyDown={keys}
      onClick={(e) => e.stopPropagation()}
    >
      {soloBet ? (
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] text-zinc-500">What happened, then #label (e.g. 24 pts #lost by one)</span>
          <Autocomplete autoFocus className="field py-0.5 text-xs" value={line} onChange={setLine} getSuggestions={lineSuggestions} aria-label="Actual result and label" placeholder="24 pts #lost by one" />
        </label>
      ) : (
        <>
          {legs.map((l, i) => (
            <label key={`${l.betId}-${l.index}`} className="flex w-40 flex-col gap-0.5">
              <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                {l.result && (
                  <button
                    type="button"
                    className={`w-6 shrink-0 rounded border border-zinc-700 text-center leading-4 ${l.result === 'won' || l.result === 'half-won' ? 'text-emerald-400' : l.result === 'lost' || l.result === 'half-lost' ? 'text-red-400' : 'text-zinc-500'}`}
                    title="Leg result: click for won, lost, not set"
                    aria-label={`${l.name} result: ${l.result}`}
                    data-testid="leg-result-toggle"
                    onClick={(e) => {
                      e.preventDefault();
                      setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, result: NEXT[x.result!] ?? 'pending', touched: true } : x)));
                    }}
                  >
                    {MARK[l.result] ?? '·'}
                  </button>
                )}
                <span className="truncate" title={l.name}>
                  {l.name}
                </span>
              </span>
              <input
                autoFocus={i === 0}
                className="field py-0.5 text-xs"
                value={l.actual}
                aria-label={`Actual: ${l.name}`}
                placeholder="what happened"
                onChange={(e) => setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, actual: e.target.value } : x)))}
              />
            </label>
          ))}
          <label className="flex w-40 flex-col gap-0.5">
            <span className="text-[11px] text-zinc-500">Label</span>
            <Autocomplete autoFocus={!legs.length} className="field py-0.5 text-xs" value={label} onChange={setLabel} getSuggestions={labelSuggestions} aria-label="Label" placeholder="lost by one" />
          </label>
        </>
      )}
      <span className="flex items-center gap-1">
        <button type="submit" className="btn btn-primary py-0.5 text-xs">
          Save
        </button>
        <button type="button" className="btn py-0.5 text-xs" onClick={props.onClose}>
          Esc
        </button>
      </span>
    </form>
  );
}
