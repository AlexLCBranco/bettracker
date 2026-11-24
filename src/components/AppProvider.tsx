'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { betNames, buildIndex, lastUsed, stakePresets, suggest, type Field, type SuggestIndex } from '@/lib/autocomplete';
import type { DutchDraft } from '@/lib/dutch';
import type { BetForm } from '@/lib/form';
import { latestGate } from '@/lib/latest';
import { REFRESH_MIN_MS, refreshGate } from '@/lib/refresh';
import { tidyBet, type NameCasing } from '@/lib/tidy';
import type { Bet, BetInput, Ladder, Money } from '@/lib/types';
import { bankroll as computeBankroll, type Bankroll, type EntryInput, type MoneyEntry } from '@/lib/bankroll';
import { todayISO } from '@/lib/dates';
import { ticketMoney, type BatchInput, type PPBatch, type PPLeg } from '@/lib/pp';

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
  /** BT-35: the next rung of a ladder carries the ladder's goal. */
  ladder?: Ladder;
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
  /** BT-33: the bankroll's money entries, newest first, and the balances they make with the bets. */
  entries: MoneyEntry[];
  bankroll: Bankroll;
  saveEntry(input: EntryInput, id?: string): Promise<MoneyEntry>;
  /** Deletes an entry; the returned function puts it back (undo). */
  removeEntry(e: MoneyEntry): Promise<() => Promise<void>>;
  /** The insert / take out money form. */
  moneyForm: MoneyFormRequest | null;
  openMoney(req?: Omit<MoneyFormRequest, 'key'>): void;
  closeMoney(): void;
  /** BT-30: PP batches, newest first. */
  batches: PPBatch[];
  /** Creates (no id) or replaces a whole batch; shown at once, put back if the server refuses. */
  saveBatch(input: BatchInput, id?: string): Promise<PPBatch>;
  /** Settles a leg or sets its actual / note. */
  patchPPLeg(batchId: string, legId: string, patch: Partial<Pick<PPLeg, 'result' | 'actual' | 'note'>>): Promise<void>;
  /** Deletes a batch; the returned function puts it back. */
  removeBatch(b: PPBatch): Promise<() => Promise<void>>;
}

export interface MoneyFormRequest {
  key: number;
  edit?: MoneyEntry;
  prefill?: Partial<EntryInput>;
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
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [batches, setBatches] = useState<PPBatch[]>([]);
  const [moneyForm, setMoneyForm] = useState<MoneyFormRequest | null>(null);
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
    Promise.all([api<Bet[]>('/api/bets'), api<MoneyEntry[]>('/api/money'), api<PPBatch[]>('/api/pp')])
      .then(([b, e, p]) => {
        setBets(b);
        setEntries(e);
        setBatches(p);
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
      Promise.all([api<Bet[]>('/api/bets'), api<MoneyEntry[]>('/api/money'), api<PPBatch[]>('/api/pp')])
        .then(([b, e, p]) => {
          if (!writes.canApply(token)) return;
          setBets(b);
          setEntries(e);
          setBatches(p);
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
    setEntries(await api<MoneyEntry[]>('/api/money'));
    setBatches(await api<PPBatch[]>('/api/pp'));
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

  const byNewest = (a: MoneyEntry, b: MoneyEntry) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);
  const saveEntry = useCallback(
    async (input: EntryInput, id?: string) => {
      const e = id
        ? await write<MoneyEntry>(`/api/money/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
        : await write<MoneyEntry>('/api/money', { method: 'POST', body: JSON.stringify(input) });
      setEntries((es) => [...es.filter((x) => x.id !== e.id), e].sort(byNewest));
      return e;
    },
    [write],
  );
  const removeEntry = useCallback(
    async (e: MoneyEntry) => {
      setEntries((es) => es.filter((x) => x.id !== e.id));
      try {
        await write(`/api/money/${e.id}`, { method: 'DELETE' });
      } catch (err) {
        setEntries((es) => [...es, e].sort(byNewest));
        notify((err as Error).message, 'error');
        throw err;
      }
      return async () => {
        const { id, createdAt, updatedAt: _u, ...input } = e;
        void _u;
        const back = await write<MoneyEntry>('/api/money', { method: 'POST', body: JSON.stringify({ ...input, restore: { id, createdAt } }) });
        setEntries((es) => [...es.filter((x) => x.id !== back.id), back].sort(byNewest));
      };
    },
    [notify, write],
  );
  const today = todayISO();
  // BT-30: placed PP tickets are money too
  const bankroll = useMemo(() => computeBankroll(entries, bets, today, ticketMoney(batches)), [entries, bets, today, batches]);

  const batchesRef = useRef(batches);
  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);
  const byPlaced = (a: PPBatch, b: PPBatch) => (a.placedDate !== b.placedDate ? (a.placedDate < b.placedDate ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);
  // BT-31: a batch's writes go one after another (ticking ~100 PPs, settling ~30 legs fast): a whole-batch PUT never
  // overtakes a newer one, and only the newest write's answer is shown.
  const ppQueue = useRef(new Map<string, Promise<unknown>>());
  const [ppGate] = useState(latestGate);
  const queued = useCallback(<T,>(batchId: string, run: () => Promise<T>): Promise<T> => {
    const p = (ppQueue.current.get(batchId) ?? Promise.resolve()).catch(() => undefined).then(run);
    ppQueue.current.set(batchId, p);
    return p;
  }, []);
  const saveBatch = useCallback(
    async (input: BatchInput, id?: string) => {
      const before = id ? batchesRef.current.find((b) => b.id === id) : undefined;
      if (before) setBatches((bs) => bs.map((b) => (b.id === id ? { ...b, ...input } : b)));
      const token = id ? ppGate.begin(id) : 0;
      try {
        const saved = id
          ? await queued(id, () => write<PPBatch>(`/api/pp/${id}`, { method: 'PUT', body: JSON.stringify(input) }))
          : await write<PPBatch>('/api/pp', { method: 'POST', body: JSON.stringify(input) });
        if (!id || ppGate.isLatest(id, token)) setBatches((bs) => [...bs.filter((b) => b.id !== saved.id), saved].sort(byPlaced));
        return saved;
      } catch (e) {
        if (before && ppGate.isLatest(id!, token)) setBatches((bs) => bs.map((b) => (b.id === id ? before : b)));
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify, write, queued, ppGate],
  );
  const patchPPLeg = useCallback(
    async (batchId: string, legId: string, patch: Partial<Pick<PPLeg, 'result' | 'actual' | 'note'>>) => {
      const apply = (bs: PPBatch[], p: typeof patch) => bs.map((b) => (b.id === batchId ? { ...b, legs: b.legs.map((l) => (l.id === legId ? { ...l, ...p } : l)) } : b));
      const old = batchesRef.current.find((b) => b.id === batchId)?.legs.find((l) => l.id === legId);
      setBatches((bs) => apply(bs, patch));
      ppGate.begin(batchId);
      try {
        await queued(batchId, () => write(`/api/pp/${batchId}/legs/${legId}`, { method: 'PATCH', body: JSON.stringify(patch) }));
      } catch (e) {
        if (old) setBatches((bs) => apply(bs, { result: old.result, actual: old.actual, note: old.note }));
        notify((e as Error).message, 'error');
      }
    },
    [notify, write, queued, ppGate],
  );
  const removeBatch = useCallback(
    async (b: PPBatch) => {
      setBatches((bs) => bs.filter((x) => x.id !== b.id));
      try {
        await write(`/api/pp/${b.id}`, { method: 'DELETE' });
      } catch (e) {
        setBatches((bs) => [...bs, b].sort(byPlaced));
        notify((e as Error).message, 'error');
        throw e;
      }
      return async () => {
        const { id, createdAt, updatedAt: _u, ...input } = b;
        void _u;
        const back = await write<PPBatch>('/api/pp', { method: 'POST', body: JSON.stringify({ ...input, restore: { id, createdAt } }) });
        setBatches((bs) => [...bs.filter((x) => x.id !== back.id), back].sort(byPlaced));
      };
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
    entries,
    bankroll,
    saveEntry,
    removeEntry,
    moneyForm,
    openMoney: (req) => setMoneyForm({ ...req, key: ++formKey.current }),
    closeMoney: () => setMoneyForm(null),
    batches,
    saveBatch,
    patchPPLeg,
    removeBatch,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
