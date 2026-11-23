'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { betNames, buildIndex, lastUsed, stakePresets, suggest, type Field, type SuggestIndex } from '@/lib/autocomplete';
import type { DutchDraft } from '@/lib/dutch';
import type { BetForm } from '@/lib/form';
import { latestGate } from '@/lib/latest';
import { REFRESH_MIN_MS, refreshGate } from '@/lib/refresh';
import { tidyBet, type NameCasing } from '@/lib/tidy';
import type { Bet, BetInput, Money } from '@/lib/types';

/** BT-20: names typed "Mccain" saved as "McCain" once that spelling is known (the server tidies games and units). */
function tidyPatch<T extends Partial<BetInput>>(p: T, names: NameCasing): T {
  if (p.betText == null && !p.legs) return p;
  const t = tidyBet({ betText: p.betText ?? '', legs: p.legs ?? [] }, names);
  return { ...p, ...(p.betText != null ? { betText: t.betText } : {}), ...(p.legs ? { legs: t.legs } : {}) };
}

/** BT-29: the new bet is the next bet of an open rollover shot: its stake is the banked payout and its money the shot's. */
export interface RolloverAdd {
  rolloverId: string;
  stake: number;
  money: Money;
  onSaved?(bet: Bet): void;
}

export type FormRequest = { mode: 'new'; prefill?: Partial<BetForm>; rollover?: RolloverAdd; key: number } | { mode: 'edit'; bet: Bet; key: number };

interface AppCtx {
  bets: Bet[];
  loaded: boolean;
  loadError: string;
  create(input: BetInput): Promise<Bet>;
  /** Creates several bets in one request (all or none). */
  createMany(inputs: BetInput[]): Promise<Bet[]>;
  /** Deletes every bet of a dutch. */
  removeDutch(dutchId: string): Promise<void>;
  /** The "log as bets" form for a dutch (from the Betting Tool, or Duplicate on a dutch). */
  /** `edit`: editing a logged dutch (BT-12), its id and bets as they were when the form opened. */
  dutchForm: { draft: DutchDraft; key: number; onSaved?: (bets: Bet[]) => void; edit?: { dutchId: string; bets: Bet[] } } | null;
  /** `onSaved` runs after the bets are saved (the Betting Tool clears itself, BT-9). */
  openDutch(draft: DutchDraft, onSaved?: (bets: Bet[]) => void, edit?: { dutchId: string; bets: Bet[] }): void;
  closeDutch(): void;
  update(id: string, patch: Partial<BetInput>): Promise<Bet>;
  remove(id: string): Promise<void>;
  /** Sends a JSON export to the server (adds missing bets only), then reloads all bets. */
  importExport(json: unknown): Promise<{ added: number; skipped: number }>;
  index: SuggestIndex;
  /** Proper name spellings seen in the bets (BT-20), for showing old text the same way. */
  names: NameCasing;
  suggestFor(field: Field, query: string, sport?: string): string[];
  defaults: ReturnType<typeof lastUsed>;
  presets: number[];
  form: FormRequest | null;
  openNew(prefill?: Partial<BetForm>, rollover?: RolloverAdd): void;
  openEdit(bet: Bet): void;
  closeForm(): void;
  toast: { text: string; kind: 'ok' | 'error'; id: number } | null;
  notify(text: string, kind?: 'ok' | 'error'): void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers }, cache: 'no-store' });
  if (res.status === 401) {
    // full page load on purpose: the proxy decides where a logged-out browser goes
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Not logged in');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormRequest | null>(null);
  const [dutchForm, setDutchForm] = useState<AppCtx['dutchForm']>(null);
  const [toast, setToast] = useState<AppCtx['toast']>(null);
  const betsRef = useRef(bets);
  const names = useMemo(() => betNames(bets), [bets]);
  const namesRef = useRef(names);
  const [updates] = useState(latestGate);
  useEffect(() => {
    betsRef.current = bets;
    namesRef.current = names;
  }, [bets, names]);
  const formKey = useRef(0);

  useEffect(() => {
    api<Bet[]>('/api/bets')
      .then((b) => {
        setBets(b);
        setLoaded(true);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // Every write goes through the gate, so a reload on focus never puts back what this page just changed.
  const [writes] = useState(refreshGate);
  const write = useCallback(<T,>(url: string, init: RequestInit) => writes.write(() => api<T>(url, init)), [writes]);

  // Reload all bets when the tab comes back into view (another tab, the phone or an e2e run may have changed them),
  // at most every few seconds, and only when nothing was written meanwhile.
  useEffect(() => {
    let lastAt = 0;
    const reload = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastAt < REFRESH_MIN_MS) return;
      lastAt = Date.now();
      const token = writes.begin();
      if (token == null) return;
      api<Bet[]>('/api/bets')
        .then((b) => {
          if (writes.canApply(token)) setBets(b);
        })
        .catch(() => undefined);
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [writes]);

  const importExport = useCallback(async (json: unknown) => {
    const r = await write<{ added: number; skipped: number }>('/api/import', { method: 'POST', body: JSON.stringify(json) });
    setBets(await api<Bet[]>('/api/bets'));
    return r;
  }, [write]);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => setToast({ text, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const create = useCallback(async (raw: BetInput) => {
    const input = tidyPatch(raw, namesRef.current);
    const bet = await write<Bet>('/api/bets', { method: 'POST', body: JSON.stringify(input) });
    setBets((bs) => [bet, ...bs]);
    return bet;
  }, [write]);

  const createMany = useCallback(async (raw: BetInput[]) => {
    const inputs = raw.map((i) => tidyPatch(i, namesRef.current));
    const made = await write<Bet[]>('/api/bets', { method: 'POST', body: JSON.stringify(inputs) });
    setBets((bs) => [...[...made].reverse(), ...bs]);
    return made;
  }, [write]);

  const removeDutch = useCallback(
    async (dutchId: string) => {
      const before = betsRef.current;
      setBets((bs) => bs.filter((b) => b.dutchId !== dutchId));
      try {
        await write(`/api/dutch/${dutchId}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
      }
    },
    [notify, write],
  );

  const update = useCallback(
    async (id: string, raw: Partial<BetInput>) => {
      const patch = tidyPatch(raw, namesRef.current);
      const before = betsRef.current.find((b) => b.id === id);
      // optimistic: show the change at once, put it back if the server refuses
      // (legs patched from the settle queue get the bet's existing leg ids until the server answers)
      if (before) setBets((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch, legs: patch.legs ? patch.legs.map((l, i) => ({ ...l, id: b.legs[i]?.id ?? `new-${i}` })) : b.legs } as Bet) : b)));
      const token = updates.begin(id);
      try {
        const bet = await write<Bet>(`/api/bets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        // a newer edit of this bet is in flight or done: its response (read after both writes) is the one to show
        if (updates.isLatest(id, token)) setBets((bs) => bs.map((b) => (b.id === id ? bet : b)));
        return bet;
      } catch (e) {
        if (before && updates.isLatest(id, token)) setBets((bs) => bs.map((b) => (b.id === id ? before : b)));
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify, updates, write],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = betsRef.current;
      setBets((bs) => bs.filter((b) => b.id !== id));
      try {
        await write(`/api/bets/${id}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
      }
    },
    [notify, write],
  );

  const index = useMemo(() => buildIndex(bets), [bets]);
  const suggestFor = useCallback((field: Field, query: string, sport?: string) => suggest(index, field, query, { sport }), [index]);
  const defaults = useMemo(() => lastUsed(bets), [bets]);
  const presets = useMemo(() => stakePresets(bets), [bets]);

  const value: AppCtx = {
    bets,
    loaded,
    loadError,
    create,
    createMany,
    removeDutch,
    dutchForm,
    openDutch: (draft, onSaved, edit) => setDutchForm({ draft, onSaved, edit, key: ++formKey.current }),
    closeDutch: () => setDutchForm(null),
    update,
    remove,
    importExport,
    index,
    names,
    suggestFor,
    defaults,
    presets,
    form,
    openNew: (prefill, rollover) => setForm({ mode: 'new', prefill, rollover, key: ++formKey.current }),
    openEdit: (bet) => setForm({ mode: 'edit', bet, key: ++formKey.current }),
    closeForm: () => setForm(null),
    toast,
    notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
