'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { applyGames, gameFields } from '@/lib/games';
import { linksFor, siteName, type GameLink } from '@/lib/gameLinks';
import type { Bet } from '@/lib/types';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

/**
 * BT-25: the game of any row (a bet, a combination, a dutch), changed in one step. Double click on the game (or Enter
 * when it has focus) opens a small editor with one box per game, recent games suggested; Enter or a click elsewhere
 * saves, Esc cancels. A row with no game shows a "+ add game" button that opens it with one click.
 */
export function GameTarget({ bets, children, hasGame, className = '', inline }: { bets: Bet[]; children: ReactNode; hasGame: boolean; className?: string; inline?: boolean }) {
  const { openEdit } = useApp();
  const [open, setOpen] = useState<Place | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const start = () => {
    // a combination whose legs were not entered has no leg to hold a game: its legs go in the full form
    const fields = gameFields(bets);
    if (!fields) return openEdit(bets[0]!);
    setOpen(place(anchor, fields.length));
  };
  return (
    <>
      {hasGame ? (
        <span
          ref={anchor}
          role="button"
          tabIndex={0}
          aria-label="Edit Game"
          title="Double click to change the game"
          className={`-mx-1 ${inline ? 'inline' : 'block min-w-0'} cursor-text rounded px-1 hover:bg-zinc-800 ${className}`}
          onDoubleClick={start}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          data-testid="game-target"
        >
          {children}
        </span>
      ) : (
        <span ref={anchor} className="inline-flex align-baseline">
          <button
            type="button"
            aria-label="Edit Game"
            title="Add the game"
            className="rounded border border-dashed border-zinc-600 px-1.5 text-[11px] leading-4 text-zinc-400 hover:border-emerald-500 hover:text-emerald-300"
            onClick={start}
            // the second click of a double click keeps the focus in the editor's box
            onMouseDown={(e) => open && e.preventDefault()}
            data-testid="add-game"
          >
            + add game
          </button>
        </span>
      )}
      {open && <GameEditor bets={bets} anchor={anchor} at={open} close={() => setOpen(null)} />}
    </>
  );
}

type Place = { top?: number; bottom?: number; left: number };

/** Under the game, or above it when it would run past the bottom of the window. */
function place(anchor: RefObject<HTMLSpanElement | null>, fields: number): Place {
  const r = anchor.current?.getBoundingClientRect() ?? { left: 8, top: 8, bottom: 8 };
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 328));
  return r.bottom + 4 + fields * 88 + 52 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left };
}

function GameEditor({ bets, anchor, at: first, close }: { bets: Bet[]; anchor: RefObject<HTMLSpanElement | null>; at: Place; close(): void }) {
  const { update, suggestFor, names, undoGroup } = useApp();
  const fields = gameFields(bets, names) ?? [];
  const [values, setValues] = useState(() => fields.map((f) => f.value));
  const [at, setAt] = useState(first);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const sports = fields.map((f) => bets.flatMap((b) => b.legs).find((l) => f.covers.includes(l.game.trim()) && l.sport)?.sport);

  const save = () => {
    if (done.current) return;
    done.current = true;
    const plan = applyGames(bets, fields, values);
    if (plan.length) void undoGroup('Games edited', undefined, () => Promise.all(plan.map(({ id, patch }) => update(id, patch, {}).catch(() => undefined))));
    close();
  };
  const cancel = () => {
    done.current = true;
    close();
  };
  const keys = useRef({ save, cancel });
  useEffect(() => {
    keys.current = { save, cancel };
  });
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) keys.current.save();
    };
    const move = () => setAt(place(anchor, fields.length));
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Edit game"
      style={at}
      className="fixed z-50 w-80 rounded-md border border-zinc-700 bg-zinc-900 p-2.5 text-sm shadow-xl"
      onKeyDown={(e) => {
        // Enter or Esc already used by a box's suggestion list
        if (e.defaultPrevented) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
      data-testid="game-editor"
    >
      {fields.map((f, i) => (
        <div key={i} className="mb-2">
          <label className="block">
          <span className="mb-0.5 block text-[11px] text-zinc-400">
            {f.label}
            {fields.length > 1 || bets.length > 1 ? <span className="text-zinc-600"> · {f.legs === 1 ? '1 leg' : `${f.legs} legs`}</span> : null}
          </span>
          <Autocomplete
            autoFocus={i === 0}
            className="field py-1 text-sm"
            value={values[i] ?? ''}
            onChange={(v) => setValues((vs) => vs.map((x, j) => (j === i ? v : x)))}
            getSuggestions={(q) => suggestFor('game', q, sports[i])}
            placeholder="Away @ Home"
            aria-label={f.label}
          />
          </label>
          {f.covers[0] && (
            <LinkBox game={f.covers[0]} date={bets.find((b) => b.legs.some((l) => l.game.trim() === f.covers[0]))?.gameDate ?? bets[0]!.gameDate} label={fields.length > 1 ? `${f.label} link` : 'Game link'} />
          )}
        </div>
      ))}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-zinc-500">Enter saves · Esc cancels</span>
        <button type="button" className="btn py-0.5 text-xs" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary py-0.5 text-xs" onClick={save}>
          Save
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * BT-42: "Game link": paste the game's page address (Hoops Junkie, Sofascore or any site) and Enter saves it for every
 * bet on that game and date, without closing the editor. Saved links are listed with × to remove one.
 */
function LinkBox({ game, date, label }: { game: string; date: string; label: string }) {
  const { gameLinks, addGameLink, removeGameLink } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const mine = linksFor(gameLinks, game, date);
  const save = async () => {
    if (!text.trim()) return;
    const err = await addGameLink(game, date, text);
    setError(err ?? '');
    if (!err) setText('');
  };
  return (
    <span className="mt-1 block">
      {mine.length > 0 && (
        <span className="mb-1 flex flex-wrap gap-1" data-testid="game-links-saved">
          {mine.map((l: GameLink) => (
            <span key={l.site} className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 text-[11px] text-zinc-300">
              {siteName(l.site)}
              <button type="button" className="text-zinc-500 hover:text-red-300" aria-label={`Remove ${siteName(l.site)} link`} title="Remove this link" onClick={() => void removeGameLink(l)}>
                ×
              </button>
            </span>
          ))}
        </span>
      )}
      <input
        className="field py-0.5 text-xs"
        value={text}
        placeholder="Paste the game's page link, Enter"
        title="A Hoops Junkie or Sofascore page (any site works). Every bet on this game shows it."
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          void save();
        }}
      />
      {error && (
        <span role="alert" className="mt-0.5 block text-[11px] text-amber-300" data-testid="game-link-error">
          {error}
        </span>
      )}
    </span>
  );
}
