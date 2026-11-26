/**
 * One open tab at a time, like WhatsApp Web: the tab opened (or taken back with "Use here") last is the one in use;
 * every other tab of the site stops and offers "Use here". Two tabs working on the same bets at once glitch (each
 * shows its own copy and saves over the other's changes).
 *
 * Tabs talk over a BroadcastChannel. A claim carries when it was made; a tab yields only to a claim newer than its own
 * (ties broken by id), so two tabs opened at the same moment never both stop.
 */
export type Claim = { type: 'claim'; id: string; at: number };

/** The part of BroadcastChannel this needs (a fake one in tests). */
export interface Bus {
  postMessage(msg: Claim): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
  removeEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
}

export const CHANNEL = 'bettracker-one-tab';

/** True when claim a beats claim b (made later; same moment: the larger id). */
export function newer(a: Pick<Claim, 'id' | 'at'>, b: Pick<Claim, 'id' | 'at'>): boolean {
  return a.at > b.at || (a.at === b.at && a.id > b.id);
}

/**
 * Starts this tab's lock: claims the site at once and calls onChange(false) when another tab claims it later,
 * onChange(true) after useHere(). now() is injectable for tests.
 */
export function tabLock(bus: Bus, id: string, onChange: (active: boolean) => void, now: () => number = Date.now) {
  let mine: Claim = { type: 'claim', id, at: 0 };
  let active = true;
  const set = (a: boolean) => {
    if (a === active) return;
    active = a;
    onChange(a);
  };
  const claim = () => {
    // never older than a claim already seen, so a clock that went back still wins
    mine = { type: 'claim', id, at: Math.max(now(), mine.at + 1) };
    bus.postMessage(mine);
    set(true);
  };
  const onMessage = (e: { data: unknown }) => {
    const c = e.data as Partial<Claim> | null;
    if (!c || c.type !== 'claim' || typeof c.id !== 'string' || typeof c.at !== 'number' || c.id === id) return;
    if (newer(c as Claim, mine)) {
      mine = { ...mine, at: Math.max(mine.at, c.at) };
      set(false);
    } else if (active) {
      // an older tab announced itself (e.g. it was asleep): it should stop, not this one
      bus.postMessage(mine);
    }
  };
  bus.addEventListener('message', onMessage);
  claim();
  return {
    isActive: () => active,
    useHere: claim,
    stop: () => bus.removeEventListener('message', onMessage),
  };
}
