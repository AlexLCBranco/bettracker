'use client';

// BT-47 / BT-52: a bet's notes, Pre / Live / Post (as on calendarkit's Slate), seen from the Bets table. Every bet
// cell has a small mark: ¶ and three dots, one per slot, lit when it holds text (dim when the row has none yet, to add
// one). Hovering it (or the keyboard-selected row, after a short pause) peeks at the text in a popover that never covers
// its row; a click on it, or D on the selected row, opens the notes under the row on its last filled slot (Pre when
// empty), the three slots one click apart. A note's web addresses are links; a click on its text edits it. A click away
// saves, Esc discards. The "Descriptions" switch opens every row that has one.

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { betLabel } from '@/lib/dutch';
import { descriptionChanges, descriptionParts, filledSlots, linkParts, nextSlot, notesOf, rowHasDescription, SLOT_FIELD, SLOT_LABEL, SLOTS, startSlot, type Slot, type Texts } from '@/lib/descriptions';
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
  /** `byHand`: opened by hand only, never by the switch (a dutch split or a chain's bet: its row opens with the switch). */
  isOpen(key: string, bets: Bet[], byHand?: boolean): boolean;
  toggle(key: string, bets: Bet[]): void;
  /** Closes a row; `byHand` false = a click away while the switch keeps it open (nothing to close). */
  close(key: string, bets: Bet[]): void;
  switchOn: boolean;
}

const nameOf = (b: Bet) => b.betText || betLabel(b);

/** The note mark in the bet cell, with its peek popover. On every row: dim when it has no note yet. */
export function DescriptionMark({ rowKey, bets, selected, control, byHand = false }: { rowKey: string; bets: Bet[]; selected: boolean; control: DescriptionControl; byHand?: boolean }) {
  const has = rowHasDescription(bets);
  const filled = filledSlots(bets);
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
  const open = control.isOpen(rowKey, bets, byHand);
  const show = has && (hover || overPop || paused) && !open;
  // a scroll moves the row out from under a still pointer without a mouseleave: the peek goes (scrolling inside it is fine)
  useEffect(() => {
    if (!show) return;
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-testid="desc-peek"]')) return;
      setHover(false);
      setOverPop(false);
      setPaused(false);
    };
    window.addEventListener('scroll', away, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', away, { capture: true });
  }, [show]);
  const state = SLOTS.map((s) => `${SLOT_LABEL[s]} ${filled.includes(s) ? '✓' : '-'}`).join(' · ');
  return (
    <>
      <button
        ref={setEl}
        type="button"
        className={`ml-1.5 inline-flex items-center gap-px rounded px-0.5 align-[1px] text-[11px] leading-4 ${open ? 'bg-sky-500/25 text-sky-200' : has ? 'text-sky-300/80 hover:bg-sky-500/20 hover:text-sky-200' : 'text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'}`}
        title={open ? `Close the notes (D) · ${state}` : has ? `Open the notes under the row (D) · ${state}` : 'Add a note: Pre, Live or Post (D)'}
        aria-label={open ? 'Close description' : has ? 'Open description' : 'Add description'}
        aria-expanded={open}
        data-testid="desc-mark"
        data-desc-mark={rowKey}
        data-filled={filled.join(',') || undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setTimeout(() => setHover(false), 120)}
        onClick={(e) => {
          e.stopPropagation();
          setHover(false);
          control.toggle(rowKey, bets);
        }}
      >
        <span aria-hidden className="before:content-['¶']" />
        <span className="ml-px inline-flex gap-[2px]" aria-hidden>
          {SLOTS.map((s) => (
            <span key={s} className={`inline-block h-[4px] w-[4px] rounded-full ${filled.includes(s) ? 'bg-sky-300' : 'bg-zinc-700'}`} data-testid="desc-dot" data-slot={s} data-lit={filled.includes(s) || undefined} />
          ))}
        </span>
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

/** A note's text with its web addresses as links (new tab). */
function NoteText({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200" onClick={(e) => e.stopPropagation()} data-testid="note-link">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
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
              <p className="whitespace-pre-wrap text-zinc-200 [overflow-wrap:anywhere]">
                <NoteText text={p.text} />
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

const PLACEHOLDER: Record<Slot, string> = { pre: 'Why this bet', live: 'During the game', post: 'What happened' };

/**
 * The opened notes: one full-width line under the row (between rows, so no column moves). Like a Slate card's note:
 * one text per bet for the slot on show, the slot's label in the corner with the three slots one click apart (and ⇄
 * to the next). A note with text shows it, links clickable; a click on it (or an empty slot) edits it. A click away
 * saves (and closes, unless the switch keeps it open); Esc closes without saving; closing it with its mark or D saves.
 */
export function DescriptionRow({ rowKey, bets, cols, control }: { rowKey: string; bets: Bet[]; cols: number; control: DescriptionControl }) {
  const { update, undoGroup } = useApp();
  const [drafts, setDrafts] = useState<Record<string, Texts>>(() => Object.fromEntries(bets.map((b) => [b.id, notesOf(b)])));
  const [slot, setSlot] = useState<Slot>(() => startSlot(bets));
  // the bet whose note is being typed in (a filled note shows as text until clicked)
  const [editing, setEditing] = useState<string | null>(null);
  const tr = useRef<HTMLTableRowElement>(null);
  const discard = useRef(false);
  const state = useRef({ drafts, bets });
  useEffect(() => {
    state.current = { drafts, bets };
  });
  const save = () => {
    const changes = descriptionChanges(state.current.bets, state.current.drafts);
    if (!changes.length) return;
    void undoGroup(changes.length === 1 ? 'Notes edited' : `Notes edited (${changes.length} bets)`, rowKey, () => Promise.all(changes.map((c) => update(c.id, c.patch, {}).catch(() => undefined))));
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
      setDrafts(Object.fromEntries(state.current.bets.map((b) => [b.id, state.current.drafts[b.id] ?? notesOf(b)])));
      setEditing(null);
      if (!control.switchOn) {
        discard.current = true; // already saved
        control.close(rowKey, state.current.bets);
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [rowKey, control]);

  const field = SLOT_FIELD[slot];
  const set = (id: string, v: string) => setDrafts((d) => ({ ...d, [id]: { ...d[id]!, [field]: v } }));
  const filled = SLOTS.filter((s) => bets.some((b) => (drafts[b.id]?.[SLOT_FIELD[s]] ?? '').trim()));
  const many = bets.length > 1;
  const label = (b: Bet) => `${SLOT_LABEL[slot]} note${many ? `: ${nameOf(b)}` : ''}`;
  const show = (s: Slot) => {
    setSlot(s);
    setEditing(null);
  };
  return (
    <tr ref={tr} className="border-b border-zinc-900 bg-zinc-900/40" data-testid="desc-row" data-desc-for={rowKey} data-slot={slot}>
      <td />
      <td colSpan={cols - 1} className="px-2 py-2">
        <div
          className="relative space-y-2"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            discard.current = true;
            control.close(rowKey, bets);
          }}
        >
          {/* the slot on show and the switch, in the corner (as on a Slate card) */}
          <div className="absolute right-0 top-0 flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide" data-testid="note-head">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === slot}
                className={`rounded px-1 leading-4 ${s === slot ? 'bg-sky-500/25 text-sky-100' : filled.includes(s) ? 'text-sky-300/80 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'}`}
                title={`${SLOT_LABEL[s]} note${filled.includes(s) ? '' : ' (empty)'}`}
                aria-label={`Show ${SLOT_LABEL[s]}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => show(s)}
                data-testid="note-slot"
                data-slot={s}
                data-filled={filled.includes(s) || undefined}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              className="rounded px-1 leading-4 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title={`Show the ${SLOT_LABEL[nextSlot(slot)]} note`}
              aria-label="Next note"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => show(nextSlot(slot))}
              data-testid="note-switch"
            >
              ⇄
            </button>
          </div>
          {bets.map((b, i) => {
            const v = drafts[b.id]?.[field] ?? '';
            const typing = editing === b.id || !v.trim();
            return (
              <div key={b.id} data-testid="desc-bet" className={i === 0 ? 'pr-44' : ''}>
                {many && <div className="mb-1 text-xs font-semibold text-zinc-300 [overflow-wrap:anywhere]">{nameOf(b)}</div>}
                {typing ? (
                  <textarea
                    autoFocus={editing === b.id || (i === 0 && !many)}
                    className="field min-h-14 w-full resize-y whitespace-pre-wrap py-1 text-xs [overflow-wrap:anywhere]"
                    rows={Math.min(8, Math.max(2, v.split('\n').length))}
                    value={v}
                    onChange={(e) => set(b.id, e.target.value)}
                    onFocus={() => setEditing(b.id)}
                    placeholder={PLACEHOLDER[slot]}
                    aria-label={label(b)}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="min-h-14 cursor-text whitespace-pre-wrap rounded border border-transparent px-2 py-1 text-xs text-zinc-200 [overflow-wrap:anywhere] hover:border-zinc-700"
                    title="Click to edit"
                    aria-label={`Edit the ${label(b)}`}
                    onClick={() => setEditing(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEditing(b.id);
                      }
                    }}
                    data-testid="note-text"
                  >
                    <NoteText text={v} />
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-zinc-500">A click elsewhere saves · Esc closes without saving</p>
        </div>
      </td>
    </tr>
  );
}
