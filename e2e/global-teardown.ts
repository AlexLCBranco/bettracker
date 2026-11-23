// Final sweep after the whole e2e run (BT-11): deletes every e2e bet still in the database, then checks none is left.
// Fails the run when a bet created by this run had to be swept (a test leaked it) or when any e2e bet remains.
import { request, type FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { deleteIds, e2eLeftovers, listBets } from './cleanup';

export const RUN_START_FILE = 'e2e/.auth/run-start.txt';
const STATE = 'e2e/.auth/state.json';

export default async function globalTeardown(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!existsSync(STATE)) {
    console.log('e2e sweep: no login state (setup did not run), nothing to sweep');
    return;
  }
  const since = existsSync(RUN_START_FILE) ? readFileSync(RUN_START_FILE, 'utf8').trim() : new Date().toISOString();
  const api = await request.newContext({ baseURL, storageState: STATE });
  try {
    const { all, thisRun } = e2eLeftovers(await listBets(api), since);
    if (all.length) console.log(`e2e sweep: deleting ${all.length} e2e bet(s): ${all.map((b) => `"${b.betText || b.book}" (${b.id})`).join(', ')}`);
    else console.log('e2e sweep: no e2e bets left');
    await deleteIds(api, all.map((b) => b.id));
    const remaining = e2eLeftovers(await listBets(api), since).all;
    if (remaining.length) throw new Error(`e2e sweep: ${remaining.length} e2e bet(s) still there after the sweep: ${remaining.map((b) => b.id).join(', ')}`);
    if (thisRun.length) throw new Error(`e2e sweep: ${thisRun.length} bet(s) from this run were left by a test (now deleted): ${thisRun.map((b) => `"${b.betText || b.book}"`).join(', ')}`);
  } finally {
    await api.dispose();
  }
}
