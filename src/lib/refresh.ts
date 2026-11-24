/**
 * Reloading all bets when the tab comes back into view, without undoing the page's own changes: a reload's result is
 * used only when no write (create, edit, settle, delete, import) was in flight when it started or began while it ran.
 * Usage: const t = gate.begin(); const bets = await …; if (gate.canApply(t)) setBets(bets);
 *        await gate.write(() => fetch(…))   (writes are sent one at a time, in order)
 */
export function refreshGate() {
  let inFlight = 0;
  let writes = 0; // writes started so far
  let queue: Promise<unknown> = Promise.resolve();
  return {
    /** Starts a reload; null when a write is in flight (skip this reload). */
    begin(): number | null {
      return inFlight > 0 ? null : writes;
    },
    /** Resolves once every write sent so far has answered. */
    idle(): Promise<void> {
      return queue.catch(() => undefined).then(() => new Promise<void>((r) => setTimeout(r, 0)));
    },
    canApply(token: number | null): boolean {
      return token != null && inFlight === 0 && writes === token;
    },
    /**
     * Runs a write after every earlier one has answered (failed or not). Overlapping requests can reach different
     * server instances on the live site and be saved in any order: a settle and its quick undo (Z), a delete and its
     * restore, would end with the older one saved while the page shows the newer.
     */
    write<T>(fn: () => Promise<T>): Promise<T> {
      inFlight++;
      writes++;
      const run = queue.catch(() => undefined).then(fn);
      queue = run;
      return run.finally(() => {
        inFlight--;
      });
    },
  };
}

/**
 * The page's first load: its result is used only when no write began while it ran (a bet quick-added before the page
 * finished loading would otherwise vanish from view, the slow first answer replacing it); else it loads again once
 * the writes have answered.
 */
export async function loadWhenQuiet<T>(gate: ReturnType<typeof refreshGate>, fetchAll: () => Promise<T>): Promise<T> {
  for (;;) {
    const token = gate.begin();
    if (token == null) {
      await gate.idle();
      continue;
    }
    const data = await fetchAll();
    if (gate.canApply(token)) return data;
  }
}

/** Reloads at most this often (focus and visibilitychange often fire together). */
export const REFRESH_MIN_MS = 5000;
