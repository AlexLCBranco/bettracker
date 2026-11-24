// One undo history for the bets (Ctrl+Z, or Z on the Bets page): adding, editing, deleting, settling, banking,
// ladder and rollover steps. It lives in the browser only: a reload starts it empty.

import type { Bet, BetInput } from './types';

export interface UndoStep {
  /** What was done, e.g. "Added: Flamengo ML". */
  label: string;
  /** The row to select again after undoing it ("bet:<id>", "dutch:<id>", "rollover:<id>"). */
  key?: string;
  /** Puts things back as they were before the step. */
  revert(): unknown;
}

/** The most steps kept; older ones drop off. */
export const UNDO_LIMIT = 50;

/**
 * A stack of steps. `group(label, fn)` turns every step recorded while `fn` runs (until its promise settles) into
 * ONE step, undone in reverse order: saving a dutch edit (updates, adds, deletes) undoes in one go.
 */
export class UndoHistory {
  private steps: UndoStep[] = [];
  private open: UndoStep[][] = [];
  /** When the last step was added (ms): a toast shown right after it offers Undo. */
  recordedAt = 0;
  constructor(private readonly changed: () => void = () => {}) {}

  get size(): number {
    return this.steps.length;
  }

  peek(): UndoStep | undefined {
    return this.steps.at(-1);
  }

  record(step: UndoStep): void {
    const g = this.open.at(-1);
    if (g) {
      g.push(step);
      return;
    }
    this.steps = [...this.steps, step].slice(-UNDO_LIMIT);
    this.recordedAt = Date.now();
    this.changed();
  }

  async group<T>(label: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    const steps: UndoStep[] = [];
    this.open.push(steps);
    try {
      return await fn();
    } finally {
      this.open.splice(this.open.indexOf(steps), 1);
      if (steps.length === 1) this.record({ ...steps[0]!, label, key: key ?? steps[0]!.key });
      else if (steps.length) this.record({ label, key: key ?? steps.at(-1)!.key, revert: () => Promise.all([...steps].reverse().map((s) => s.revert())) });
    }
  }

  /** Takes the last step off and reverts it; undefined when there is nothing to undo. */
  undo(): UndoStep | undefined {
    const last = this.steps.at(-1);
    if (!last) return undefined;
    this.steps = this.steps.slice(0, -1);
    this.changed();
    void Promise.resolve()
      .then(() => last.revert())
      .catch(() => undefined);
    return last;
  }
}

/** The fields an edit changed, as they were before it: patching these back undoes the edit. */
export function revertPatch(before: Bet, patch: Partial<BetInput>): Partial<BetInput> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof BetInput)[]) {
    if (k === 'legs') out.legs = before.legs.map(({ id: _id, ...l }) => (void _id, l));
    else out[k] = before[k] ?? null;
  }
  return out as Partial<BetInput>;
}

/** Ctrl+Z (Cmd+Z): undo. In a text field it stays the field's own undo (check for typing first). */
export const isUndoKey = (e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'key'>) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z';
