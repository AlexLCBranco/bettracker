import { describe, expect, it } from 'vitest';
import { newer, tabLock, type Bus, type Claim } from '@/lib/oneTab';

/** A fake BroadcastChannel network: a message goes to every other tab, synchronously. */
function network() {
  const tabs: { fns: Set<(e: { data: unknown }) => void> }[] = [];
  const join = (): Bus => {
    const me = { fns: new Set<(e: { data: unknown }) => void>() };
    tabs.push(me);
    return {
      postMessage: (msg: Claim) => tabs.filter((t) => t !== me).forEach((t) => [...t.fns].forEach((f) => f({ data: structuredClone(msg) }))),
      addEventListener: (_t, f) => me.fns.add(f),
      removeEventListener: (_t, f) => me.fns.delete(f),
    };
  };
  return { join };
}

function open(net: ReturnType<typeof network>, id: string, now: () => number) {
  const states: boolean[] = [];
  const lock = tabLock(net.join(), id, (a) => states.push(a), now);
  return { lock, states };
}

describe('one open tab (WhatsApp-style)', () => {
  it('a new tab stops the one open before it', () => {
    const net = network();
    let t = 1000;
    const a = open(net, 'a', () => t);
    t = 2000;
    const b = open(net, 'b', () => t);
    expect(a.lock.isActive()).toBe(false);
    expect(b.lock.isActive()).toBe(true);
    expect(a.states).toEqual([false]);
  });

  it('"Use here" takes it back, and the other tab stops', () => {
    const net = network();
    let t = 1000;
    const a = open(net, 'a', () => t);
    t = 2000;
    const b = open(net, 'b', () => t);
    t = 3000;
    a.lock.useHere();
    expect(a.lock.isActive()).toBe(true);
    expect(b.lock.isActive()).toBe(false);
    expect(a.states).toEqual([false, true]);
  });

  it('"Use here" wins even when this tab\'s clock is behind the other\'s', () => {
    const net = network();
    const a = open(net, 'a', () => 100);
    const b = open(net, 'b', () => 5000);
    expect(a.lock.isActive()).toBe(false);
    a.lock.useHere(); // a's clock still says 100
    expect(a.lock.isActive()).toBe(true);
    expect(b.lock.isActive()).toBe(false);
  });

  it('two tabs opened at the same moment: exactly one stays in use', () => {
    const net = network();
    const a = open(net, 'a', () => 1000);
    const b = open(net, 'b', () => 1000);
    expect([a.lock.isActive(), b.lock.isActive()].filter(Boolean)).toHaveLength(1);
  });

  it('a late claim from an older tab makes that tab stop, not the newer one', () => {
    const net = network();
    const bus = net.join();
    const b = open(net, 'b', () => 5000);
    const seen: unknown[] = [];
    bus.addEventListener('message', (e) => seen.push(e.data));
    bus.postMessage({ type: 'claim', id: 'old', at: 1000 });
    expect(b.lock.isActive()).toBe(true);
    expect(seen).toEqual([{ type: 'claim', id: 'b', at: 5000 }]);
  });

  it('ignores junk and its own messages; stop() stops listening', () => {
    const net = network();
    const bus = net.join();
    const a = open(net, 'a', () => 1000);
    bus.postMessage('hello' as unknown as Claim);
    bus.postMessage({ type: 'claim', id: 'a', at: 9999 });
    expect(a.lock.isActive()).toBe(true);
    a.lock.stop();
    bus.postMessage({ type: 'claim', id: 'z', at: 9999 });
    expect(a.lock.isActive()).toBe(true);
  });

  it('newer(): later wins, a tie goes to the larger id', () => {
    expect(newer({ id: 'a', at: 2 }, { id: 'b', at: 1 })).toBe(true);
    expect(newer({ id: 'b', at: 1 }, { id: 'a', at: 1 })).toBe(true);
    expect(newer({ id: 'a', at: 1 }, { id: 'b', at: 1 })).toBe(false);
  });
});
