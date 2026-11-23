'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildIndex, lastUsed, stakePresets, suggest, type Field, type SuggestIndex } from '@/lib/autocomplete';
import type { DutchDraft } from '@/lib/dutch';
import type { BetForm } from '@/lib/form';
import { latestGate } from '@/lib/latest';
import type { Bet, BetInput } from '@/lib/types';

export type FormRequest = { mode: 'new'; prefill?: Partial<BetForm>; key: number } | { mode: 'edit'; bet: Bet; key: number };

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
  dutchForm: { draft: DutchDraft; key: number; onSaved?: (bets: Bet[]) => void } | null;
  /** `onSaved` runs after the bets are saved (the Betting Tool clears itself, BT-9). */
  openDutch(draft: DutchDraft, onSaved?: (bets: Bet[]) => void): void;
  closeDutch(): void;
  update(id: string, patch: Partial<BetInput>): Promise<Bet>;
  remove(id: string): Promise<void>;
  /** Sends a JSON export to the server (adds missing bets only), then reloads all bets. */
  importExport(json: unknown): Promise<{ added: number; skipped: number }>;
  index: SuggestIndex;
  suggestFor(field: Field, query: string, sport?: string): string[];
  defaults: ReturnType<typeof lastUsed>;
  presets: number[];
  form: FormRequest | null;
  openNew(prefill?: Partial<BetForm>): void;
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
  const [updates] = useState(latestGate);
  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);
  const formKey = useRef(0);

  useEffect(() => {
    api<Bet[]>('/api/bets')
      .then((b) => {
        setBets(b);
        setLoaded(true);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const importExport = useCallback(async (json: unknown) => {
    const r = await api<{ added: number; skipped: number }>('/api/import', { method: 'POST', body: JSON.stringify(json) });
    setBets(await api<Bet[]>('/api/bets'));
    return r;
  }, []);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => setToast({ text, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const create = useCallback(async (input: BetInput) => {
    const bet = await api<Bet>('/api/bets', { method: 'POST', body: JSON.stringify(input) });
    setBets((bs) => [bet, ...bs]);
    return bet;
  }, []);

  const createMany = useCallback(async (inputs: BetInput[]) => {
    const made = await api<Bet[]>('/api/bets', { method: 'POST', body: JSON.stringify(inputs) });
    setBets((bs) => [...[...made].reverse(), ...bs]);
    return made;
  }, []);

  const removeDutch = useCallback(
    async (dutchId: string) => {
      const before = betsRef.current;
      setBets((bs) => bs.filter((b) => b.dutchId !== dutchId));
      try {
        await api(`/api/dutch/${dutchId}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
      }
    },
    [notify],
  );

  const update = useCallback(
    async (id: string, patch: Partial<BetInput>) => {
      const before = betsRef.current.find((b) => b.id === id);
      // optimistic: show the change at once, put it back if the server refuses
      // (legs patched from the settle queue get the bet's existing leg ids until the server answers)
      if (before) setBets((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch, legs: patch.legs ? patch.legs.map((l, i) => ({ ...l, id: b.legs[i]?.id ?? `new-${i}` })) : b.legs } as Bet) : b)));
      const token = updates.begin(id);
      try {
        const bet = await api<Bet>(`/api/bets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        // a newer edit of this bet is in flight or done: its response (read after both writes) is the one to show
        if (updates.isLatest(id, token)) setBets((bs) => bs.map((b) => (b.id === id ? bet : b)));
        return bet;
      } catch (e) {
        if (before && updates.isLatest(id, token)) setBets((bs) => bs.map((b) => (b.id === id ? before : b)));
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify, updates],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = betsRef.current;
      setBets((bs) => bs.filter((b) => b.id !== id));
      try {
        await api(`/api/bets/${id}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
      }
    },
    [notify],
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
    openDutch: (draft, onSaved) => setDutchForm({ draft, onSaved, key: ++formKey.current }),
    closeDutch: () => setDutchForm(null),
    update,
    remove,
    importExport,
    index,
    suggestFor,
    defaults,
    presets,
    form,
    openNew: (prefill) => setForm({ mode: 'new', prefill, key: ++formKey.current }),
    openEdit: (bet) => setForm({ mode: 'edit', bet, key: ++formKey.current }),
    closeForm: () => setForm(null),
    toast,
    notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
