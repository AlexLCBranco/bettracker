import { test as base, expect, type APIRequestContext } from '@playwright/test';
import type { Bet } from '../src/lib/types';

/** A unique tag per test, put in bet texts so a test only ever touches its own bets (the live DB has real ones). */
export const makeTag = () => `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createBet(request: APIRequestContext, over: Record<string, unknown>): Promise<Bet> {
  const res = await request.post('/api/bets', {
    data: { stake: 10, odds: 2, result: 'pending', placedDate: '2000-01-01', gameDate: '2000-01-01', book: 'E2E Book', legs: [], ...over },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Bet;
}

export async function betsTagged(request: APIRequestContext, tag: string): Promise<Bet[]> {
  const res = await request.get('/api/bets');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as Bet[]).filter((b) => b.betText.includes(tag) || b.book.includes(tag));
}

/** Gives each test a tag and deletes every bet carrying it afterwards. */
export const test = base.extend<{ tag: string }>({
  tag: async ({ request }, use) => {
    const tag = makeTag();
    await use(tag);
    for (const b of await betsTagged(request, tag)) await request.delete(`/api/bets/${b.id}`);
  },
});

export { expect };
