// Cleanup of the bets e2e tests create (BT-11). Every test tags its bets "e2e-…" and dates them 2000-01-0x; its
// fixture deletes them by id whether it passed or failed, and a final sweep after the whole run deletes any e2e bet
// still there (from this run or an older one). The run fails when a bet from THIS run had to be swept: a test leaked.

/** The fields the sweep looks at. */
export interface SweepBet {
  id: string;
  betText: string;
  book: string;
  placedDate: string;
  gameDate: string;
  createdAt: string;
  legs: { selection: string; game: string }[];
}

const E2E_TEXT = /\be2e-[a-z0-9]{6,}/i;
const E2E_DATE = /^2000-01-0\d$/;

/** A bet made by an e2e test: an "e2e-…" tag in its text, book, selection or game, or dated 2000-01-0x. */
export const isE2eBet = (b: SweepBet): boolean =>
  E2E_TEXT.test(b.betText) || E2E_TEXT.test(b.book) || b.legs.some((l) => E2E_TEXT.test(l.selection) || E2E_TEXT.test(l.game)) || E2E_DATE.test(b.placedDate) || E2E_DATE.test(b.gameDate);

/** The e2e bets among `bets`, and which of them were created at or after `since` (this run: a leak). */
export function e2eLeftovers(bets: SweepBet[], since: string): { all: SweepBet[]; thisRun: SweepBet[] } {
  const all = bets.filter(isE2eBet);
  return { all, thisRun: all.filter((b) => b.createdAt >= since) };
}

/** Minimal request interface (Playwright's APIRequestContext fits). */
export interface Requester {
  get(url: string): Promise<{ ok(): boolean; status(): number; json(): Promise<unknown> }>;
  delete(url: string): Promise<{ status(): number }>;
}

/** Deletes each id; a 404 (already gone) is fine, anything else is an error. */
export async function deleteIds(request: Requester, ids: Iterable<string>): Promise<void> {
  const failed: string[] = [];
  for (const id of ids) {
    const r = await request.delete(`/api/bets/${id}`);
    if (r.status() !== 200 && r.status() !== 404) failed.push(`${id} (${r.status()})`);
  }
  if (failed.length) throw new Error(`e2e cleanup: could not delete ${failed.join(', ')}`);
}

export async function listBets(request: Requester): Promise<SweepBet[]> {
  const r = await request.get('/api/bets');
  if (!r.ok()) throw new Error(`e2e cleanup: GET /api/bets returned ${r.status()}`);
  return (await r.json()) as SweepBet[];
}

// BT-33: money entries made by e2e tests carry the tag in their book or note (and are dated 2000-01-0x).
export interface SweepEntry {
  id: string;
  book: string;
  note: string;
  date: string;
  createdAt: string;
}

export const isE2eEntry = (e: SweepEntry): boolean => E2E_TEXT.test(e.book) || E2E_TEXT.test(e.note) || E2E_DATE.test(e.date);

export async function listEntries(request: Requester): Promise<SweepEntry[]> {
  const r = await request.get('/api/money');
  if (!r.ok()) throw new Error(`e2e cleanup: GET /api/money returned ${r.status()}`);
  return (await r.json()) as SweepEntry[];
}

/** Deletes money entries by id; a 404 (already gone) is fine. */
export async function deleteEntryIds(request: Requester, ids: Iterable<string>): Promise<void> {
  const failed: string[] = [];
  for (const id of ids) {
    const r = await request.delete(`/api/money/${id}`);
    if (r.status() !== 200 && r.status() !== 404) failed.push(`${id} (${r.status()})`);
  }
  if (failed.length) throw new Error(`e2e cleanup: could not delete money entries ${failed.join(', ')}`);
}

// BT-30: PP batches made by e2e tests carry the tag in their name or book (and are dated 2000-01-0x).
export interface SweepBatch {
  id: string;
  name: string;
  book: string;
  placedDate: string;
  createdAt: string;
}

export const isE2eBatch = (b: SweepBatch): boolean => E2E_TEXT.test(b.name) || E2E_TEXT.test(b.book) || E2E_DATE.test(b.placedDate);

export async function listBatches(request: Requester): Promise<SweepBatch[]> {
  const r = await request.get('/api/pp');
  if (!r.ok()) throw new Error(`e2e cleanup: GET /api/pp returned ${r.status()}`);
  return (await r.json()) as SweepBatch[];
}

export async function deleteBatchIds(request: Requester, ids: Iterable<string>): Promise<void> {
  const failed: string[] = [];
  for (const id of ids) {
    const r = await request.delete(`/api/pp/${id}`);
    if (r.status() !== 200 && r.status() !== 404) failed.push(`${id} (${r.status()})`);
  }
  if (failed.length) throw new Error(`e2e cleanup: could not delete PP batches ${failed.join(', ')}`);
}
