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

/** Reloads at most this often (focus and visibilitychange often fire together). */
export const REFRESH_MIN_MS = 5000;
