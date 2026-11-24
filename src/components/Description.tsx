'use client';

// BT-47: a bet's description (the "before" and "after" texts of the bet form) seen from the Bets table. A small mark
// in the bet cell when there is one; hovering it (or the keyboard-selected row, after a short pause) peeks at the text
// in a popover that never covers its row; a click on it, or D on the selected row, opens the texts under the row,
// editable there. A click away saves, Esc discards. The "Descriptions" switch opens every row that has one.

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { betLabel } from '@/lib/dutch';
import { descriptionChanges, descriptionParts, rowHasDescription } from '@/lib/descriptions';
import type { Bet } from '@/lib/types';
import { useApp } from './AppProvider';

const SWITCH_KEY = 'bettracker.descriptions';
const listeners = new Set<() => void>();

/** The "Descriptions" switch: off by default, remembered in this browser. */
export function useDescriptionsSwitch(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => localStorage.getItem(SWITCH_KEY) === 'on',
    () => false,
  );
  return [
    on,
    (v) => {
      localStorage.setItem(SWITCH_KEY, v ? 'on' : 'off');
      listeners.forEach((l) => l());
    },
  ];
}

/** What the table needs to show descriptions: which rows are open, and how to open or close one. */
export interface DescriptionControl {
  isOpen(key: string, bets: Bet[]): boolean;
  toggle(key: string, bets: Bet[]): void;
  /** Closes a row; `byHand` false = a click away while the switch keeps it open (nothing to close). */
  close(key: string, bets: Bet[]): void;
  switchOn: boolean;
}

const nameOf = (b: Bet) => b.betText || betLabel(b);

/** The note mark in the bet cell, with its peek popover. Nothing when the row has no description. */
export function DescriptionMark({ rowKey, bets, selected, control }: { rowKey: string; bets: Bet[]; selected: boolean; control: DescriptionControl }) {
  const has = rowHasDescription(bets);
  const [el, setEl] = useState<HTMLButtonElement | null>(null);
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(false);
  const [overPop, setOverPop] = useState(false);
  useEffect(() => {
    if (!selected || !has) return;
    const t = setTimeout(() => setPaused(true), 700);
    return () => {
      clearTimeout(t);
      setPaused(false);
    };
  }, [selected, has]);
  if (!has) return null;
  const open = control.isOpen(rowKey, bets);
  const show = (hover || overPop || paused) && !open;
  return (
    <>
      <button
        ref={setEl}
        type="button"
        className={`ml-1.5 inline-block rounded px-0.5 align-[1px] text-[11px] leading-4 ${open ? 'bg-sky-500/25 text-sky-200' : 'text-sky-300/80 hover:bg-sky-500/20 hover:text-sky-200'}`}
        title={open ? 'Close the description (D)' : 'Open the description under the row (D)'}
        aria-label={open ? 'Close description' : 'Open description'}
        aria-expanded={open}
        data-testid="desc-mark"
        data-desc-mark={rowKey}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setTimeout(() => setHover(false), 120)}
        onClick={(e) => {
          e.stopPropagation();
          setHover(false);
          control.toggle(rowKey, bets);
        }}
      >
        ¶
      </button>
      {show && el && <Peek anchor={el} bets={bets} onHover={setOverPop} />}
    </>
  );
}

/** Below the row, or above it when there is no room: never over the row it belongs to. */
function place(anchor: HTMLElement): CSSProperties {
  const row = anchor.closest('tr')?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(a.left - 8, window.innerWidth - 408));
  const below = window.innerHeight - row.bottom;
  return below >= 180 || below >= row.top ? { top: row.bottom + 4, left, maxHeight: Math.max(120, below - 12) } : { bottom: window.innerHeight - row.top + 4, left, maxHeight: Math.max(120, row.top - 12) };
}

function Peek({ anchor, bets, onHover }: { anchor: HTMLElement; bets: Bet[]; onHover(on: boolean): void }) {
  const withText = bets.filter((b) => descriptionParts(b).length);
  return createPortal(
    <div
      role="tooltip"
      className="fixed z-50 w-[400px] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl"
      style={place(anchor)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      data-testid="desc-peek"
    >
      {withText.map((b) => (
        <div key={b.id} className="mb-2 last:mb-0">
          {bets.length > 1 && <div className="mb-1 font-semibold text-zinc-200">{nameOf(b)}</div>}
          {descriptionParts(b).map((p) => (
            <div key={p.label} className="mb-1.5 last:mb-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{p.label}</div>
              <p className="whitespace-pre-wrap text-zinc-200 [overflow-wrap:anywhere]">{p.text}</p>
            </div>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

type Draft = { preAnalysis: string; postAnalysis: string };

/**
 * The opened description: one full-width line under the row (between rows, so no column moves), both texts editable.
 * A click away saves (and closes, unless the switch keeps it open); Esc closes without saving; closing it with its
 * mark or D saves.
 */
export function DescriptionRow({ rowKey, bets, cols, control }: { rowKey: string; bets: Bet[]; cols: number; control: DescriptionControl }) {
  const { update, undoGroup } = useApp();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(bets.map((b) => [b.id, { preAnalysis: b.preAnalysis, postAnalysis: b.postAnalysis }])));
  const tr = useRef<HTMLTableRowElement>(null);
  const discard = useRef(false);
  const state = useRef({ drafts, bets });
  useEffect(() => {
    state.current = { drafts, bets };
  });
  const save = () => {
    const changes = descriptionChanges(state.current.bets, state.current.drafts);
    if (!changes.length) return;
    void undoGroup(changes.length === 1 ? 'Description edited' : `Descriptions edited (${changes.length} bets)`, rowKey, () => Promise.all(changes.map((c) => update(c.id, c.patch, {}).catch(() => undefined))));
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  // closed by its mark or D (or the switch): what was typed is kept
  useEffect(
    () => () => {
      if (!discard.current) saveRef.current();
    },
    [],
  );
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (tr.current?.contains(t) || t.closest(`[data-desc-mark="${CSS.escape(rowKey)}"]`)) return;
      saveRef.current();
      // saved: what is typed now is the new starting point
      setDrafts(Object.fromEntries(state.current.bets.map((b) => [b.id, state.current.drafts[b.id] ?? { preAnalysis: b.preAnalysis, postAnalysis: b.postAnalysis }])));
      if (!control.switchOn) {
        discard.current = true; // already saved
        control.close(rowKey, state.current.bets);
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [rowKey, control]);

  const set = (id: string, k: keyof Draft, v: string) => setDrafts((d) => ({ ...d, [id]: { ...d[id]!, [k]: v } }));
  const many = bets.length > 1;
  return (
    <tr ref={tr} className="border-b border-zinc-900 bg-zinc-900/40" data-testid="desc-row" data-desc-for={rowKey}>
      <td />
      <td colSpan={cols - 1} className="px-2 py-2">
        <div
          className="space-y-2"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            discard.current = true;
            control.close(rowKey, bets);
          }}
        >
          {bets.map((b) => (
            <div key={b.id} data-testid="desc-bet">
              {many && <div className="mb-1 text-xs font-semibold text-zinc-300 [overflow-wrap:anywhere]">{nameOf(b)}</div>}
              <div className="grid grid-cols-2 gap-2">
                {(['preAnalysis', 'postAnalysis'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{k === 'preAnalysis' ? 'Before' : 'After'}</span>
                    <textarea
                      className="field min-h-14 resize-y whitespace-pre-wrap py-1 text-xs [overflow-wrap:anywhere]"
                      rows={Math.min(8, Math.max(2, (drafts[b.id]?.[k] ?? '').split('\n').length))}
                      value={drafts[b.id]?.[k] ?? ''}
                      onChange={(e) => set(b.id, k, e.target.value)}
                      placeholder={k === 'preAnalysis' ? 'Why this bet' : 'What happened'}
                      aria-label={`${k === 'preAnalysis' ? 'Before' : 'After'}${many ? `: ${nameOf(b)}` : ''}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-500">A click elsewhere saves · Esc closes without saving</p>
        </div>
      </td>
    </tr>
  );
}
