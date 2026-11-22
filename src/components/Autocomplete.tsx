'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange(value: string): void;
  /** Suggestions for the query; an empty query means "show recent". */
  getSuggestions(query: string): string[];
  /** What part of the value is the query (default: all of it). */
  toQuery?(value: string): string;
  /** The new value when a suggestion is accepted (default: the suggestion). */
  applySuggestion?(value: string, suggestion: string): string;
  /** Lets the caller show suggestions that are not the query's matches (e.g. the quick-add's recent lines). */
  onAccept?(value: string): void;
};

/**
 * Text input with suggestions. Focus shows recent entries; typing filters. Arrow keys move, Enter or Tab accepts
 * the highlighted one, Esc closes the list. Nothing is highlighted until an arrow key is pressed, so Enter on a typed
 * value submits it as typed.
 */
export const Autocomplete = forwardRef<HTMLInputElement, Props>(function Autocomplete(
  { value, onChange, getSuggestions, toQuery = (v) => v, applySuggestion = (_v, s) => s, onAccept, onKeyDown, onFocus, onBlur, className, ...rest },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const listId = useId();
  const items = open ? getSuggestions(toQuery(value)) : [];
  const shown = items.length > 0;

  const accept = (s: string) => {
    const v = applySuggestion(value, s);
    onChange(v);
    setOpen(false);
    setHi(-1);
    onAccept?.(v);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHi(e.key === 'ArrowDown' ? 0 : -1);
        return;
      }
      const n = items.length;
      if (!n) return;
      setHi((h) => (e.key === 'ArrowDown' ? Math.min(n - 1, h + 1) : Math.max(-1, h - 1)));
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && shown && hi >= 0 && items[hi] != null) {
      if (e.key === 'Enter') e.preventDefault(); // Tab accepts and moves on
      accept(items[hi]!);
      return;
    }
    if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setHi(-1);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        {...rest}
        className={className ?? 'field'}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hi >= 0 ? `${listId}-${hi}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          setHi(-1);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          setHi(-1);
          onBlur?.(e);
        }}
        onKeyDown={handleKey}
      />
      {shown && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl">
          {items.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              className={`cursor-pointer truncate px-3 py-1.5 ${i === hi ? 'bg-emerald-600/30 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              onMouseEnter={() => setHi(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
