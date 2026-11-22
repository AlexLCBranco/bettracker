'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildIndex, lastUsed, stakePresets, suggest, type Field, type SuggestIndex } from '@/lib/autocomplete';
import type { BetForm } from '@/lib/form';
import type { Bet, BetInput } from '@/lib/types';

export type FormRequest = { mode: 'new'; prefill?: Partial<BetForm>; key: number } | { mode: 'edit'; bet: Bet; key: number };

interface AppCtx {
  bets: Bet[];
  loaded: boolean;
  loadError: string;
  create(input: BetInput): Promise<Bet>;
  update(id: string, patch: Partial<BetInput>): Promise<Bet>;
  remove(id: string): Promise<void>;
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
  const [toast, setToast] = useState<AppCtx['toast']>(null);
  const betsRef = useRef(bets);
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

  const update = useCallback(
    async (id: string, patch: Partial<BetInput>) => {
      const before = betsRef.current.find((b) => b.id === id);
      // optimistic: show the change at once, put it back if the server refuses
      if (before && !patch.legs) setBets((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } as Bet : b)));
      try {
        const bet = await api<Bet>(`/api/bets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        setBets((bs) => bs.map((b) => (b.id === id ? bet : b)));
        return bet;
      } catch (e) {
        if (before) setBets((bs) => bs.map((b) => (b.id === id ? before : b)));
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify],
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
    update,
    remove,
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
