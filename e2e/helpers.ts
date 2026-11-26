import { test as base, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import type { Bet } from '../src/lib/types';
import { deleteBatchIds, deleteEntryIds, deleteIds, listBatches, listEntries } from './cleanup';

/** A unique tag per test, put in bet texts so a test only ever touches its own bets (the live DB has real ones). */
export const makeTag = () => `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Ids of the bets the running test created (through createBet or the app), deleted by id when it ends. */
let created: Set<string> | null = null;

export async function createBet(request: APIRequestContext, over: Record<string, unknown>): Promise<Bet> {
  const res = await request.post('/api/bets', {
    data: { stake: 10, odds: 2, result: 'pending', placedDate: '2000-01-01', gameDate: '2000-01-01', book: 'E2E Book', legs: [], ...over },
  });
  expect(res.status(), await res.text()).toBe(201);
  const bet = (await res.json()) as Bet;
  created?.add(bet.id);
  return bet;
}

export async function betsTagged(request: APIRequestContext, tag: string): Promise<Bet[]> {
  const res = await request.get('/api/bets');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as Bet[]).filter((b) => b.betText.includes(tag) || b.book.includes(tag) || b.legs.some((l) => l.selection.includes(tag) || l.game.includes(tag)));
}

/**
 * Gives each test a tag. When the test ends, passed or failed, deletes every bet it created (by id: the ones made
 * through createBet and the ones the app saved, read from its POST /api/bets responses) and every bet carrying its
 * tag; a delete that fails fails the test (BT-11).
 */
/**
 * Waits until the page has no change still saving (<html data-saving> gone). On the live site each write takes ~0.5 s
 * and they go one at a time, so the page can be seconds ahead of the server.
 */
export async function saved(page: Page) {
  await expect(page.locator('html[data-saving]')).toHaveCount(0, { timeout: 30_000 });
}

export const test = base.extend<{ tag: string }>({
  // a new page load drops the writes still queued (and the page asks first): goto and reload wait for them
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (...args: Parameters<Page['goto']>) => {
      if (page.url().startsWith('http')) await saved(page);
      return goto(...args);
    };
    page.reload = async (...args: Parameters<Page['reload']>) => {
      await saved(page);
      return reload(...args);
    };
    await use(page);
  },
  tag: async ({ request, context }, use) => {
    const tag = makeTag();
    const ids = new Set<string>();
    created = ids;
    const reading: Promise<void>[] = [];
    const onResponse = (res: Response) => {
      if (res.request().method() !== 'POST' || new URL(res.url()).pathname !== '/api/bets' || res.status() !== 201) return;
      reading.push(
        res
          .json()
          .then((body: Bet | Bet[]) => {
            for (const b of Array.isArray(body) ? body : [body]) if (b?.id) ids.add(b.id);
          })
          .catch(() => undefined),
      );
    };
    context.on('response', onResponse);
    try {
      await use(tag);
    } finally {
      context.off('response', onResponse);
      created = null;
      await Promise.allSettled(reading);
      for (const b of await betsTagged(request, tag)) ids.add(b.id);
      await deleteIds(request, ids);
      // BT-33: the money entries it made (tag in the book or note)
      await deleteEntryIds(request, (await listEntries(request)).filter((e) => e.book.includes(tag) || e.note.includes(tag)).map((e) => e.id));
      // BT-30: its PP batches (tag in the name or book)
      await deleteBatchIds(request, (await listBatches(request)).filter((b) => b.name.includes(tag) || b.book.includes(tag)).map((b) => b.id));
    }
  },
});

export { expect };

/** BT-60: the money scope and units switches live in the top bar's menu: opens it when closed, returns its panel. */
export async function viewMenu(page: Page) {
  const panel = page.getByTestId('view-menu-panel');
  if (!(await panel.isVisible())) await page.getByTestId('view-menu').click();
  return panel;
}
