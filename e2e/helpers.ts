import { test as base, expect, type APIRequestContext, type Response } from '@playwright/test';
import type { Bet } from '../src/lib/types';
import { deleteIds } from './cleanup';

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
export const test = base.extend<{ tag: string }>({
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
    }
  },
});

export { expect };
