'use client';

import type { FocusEvent, KeyboardEvent } from 'react';
import { normalizeOddsText, oddsFromText, oddsHint } from '@/lib/money';

/**
 * An odds box that takes any format (BT-16): -114, +220, 5/2, 1,3, 40%… While typing another format a hint shows
 * "-114 → 1.88"; on blur the text becomes the decimal value. A red border only when nothing reads.
 */
export function OddsInput({
  value,
  onChange,
  className = 'field',
  hintClassName = '',
  onBlur,
  ...rest
}: {
  value: string;
  onChange(v: string): void;
  'aria-label': string;
  className?: string;
  hintClassName?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onBlur?(e: FocusEvent<HTMLInputElement>, normalized: string): void;
  onKeyDown?(e: KeyboardEvent<HTMLInputElement>): void;
}) {
  const typed = value.trim() !== '';
  const bad = typed && oddsFromText(value) == null;
  const hint = oddsHint(value);
  return (
    <span className="relative flex min-w-0 flex-col">
      <input
        {...rest}
        className={`${className} tabular-nums ${bad ? 'border-red-500' : ''}`}
        inputMode="decimal"
        value={value}
        aria-invalid={bad || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const n = normalizeOddsText(value);
          if (n !== value) onChange(n);
          onBlur?.(e, n);
        }}
      />
      {hint && (
        <span className={`pointer-events-none absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] ${bad ? 'text-red-400' : 'text-zinc-300'} ${hintClassName}`} data-testid="odds-hint">
          {hint}
        </span>
      )}
    </span>
  );
}
