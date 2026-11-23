/**
 * Reloading all bets when the tab comes back into view, without undoing the page's own changes: a reload's result is
 * used only when no write (create, edit, settle, delete, import) was in flight when it started or began while it ran.
 * Usage: const t = gate.begin(); const bets = await …; if (gate.canApply(t)) setBets(bets);
 *        await gate.write(() => fetch(…))
 */
export function refreshGate() {
  let inFlight = 0;
  let writes = 0; // writes started so far
  return {
    /** Starts a reload; null when a write is in flight (skip this reload). */
    begin(): number | null {
      return inFlight > 0 ? null : writes;
    },
    canApply(token: number | null): boolean {
      return token != null && inFlight === 0 && writes === token;
    },
    async write<T>(fn: () => Promise<T>): Promise<T> {
      inFlight++;
      writes++;
      try {
        return await fn();
      } finally {
        inFlight--;
      }
    },
  };
}

/** Reloads at most this often (focus and visibilitychange often fire together). */
export const REFRESH_MIN_MS = 5000;
