'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { betNames, buildIndex, lastUsed, stakePresets, suggest, type Field, type SuggestIndex } from '@/lib/autocomplete';
import { betLabel, type DutchDraft } from '@/lib/dutch';
import type { BetForm } from '@/lib/form';
import { latestGate } from '@/lib/latest';
import { REFRESH_MIN_MS, refreshGate } from '@/lib/refresh';
import { tidyBet, type NameCasing } from '@/lib/tidy';
import type { Bet, BetInput, Ladder, Money } from '@/lib/types';
import { bankroll as computeBankroll, type Bankroll, type EntryInput, type MoneyEntry } from '@/lib/bankroll';
import { todayISO } from '@/lib/dates';
import { ticketMoney, type BatchInput, type PPBatch, type PPLeg } from '@/lib/pp';
import { revertPatch, UndoHistory, type UndoStep } from '@/lib/undo';

/** How a write goes into the undo history: false keeps it out (a step recorded elsewhere covers it). */
export type UndoAs = false | { label?: string; key?: string };

/** The bet's text, short, for undo labels. */
const describe = (b: Bet) => (b.betText || betLabel(b) || 'bet').slice(0, 60);
const keyOf = (b: Bet) => (b.dutchId ? `dutch:${b.dutchId}` : b.rolloverId ? `rollover:${b.rolloverId}` : `bet:${b.id}`);

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

/** BT-36: a new bet that starts a ladder (from the Ladder sim), with its goal. */
export type LadderStart = { goalRungs: number | null; goalAmount: number | null };

export type FormRequest = { mode: 'new'; prefill?: Partial<BetForm>; rollover?: RolloverAdd; ladder?: LadderStart; key: number } | { mode: 'edit'; bet: Bet; key: number };

interface AppCtx {
  bets: Bet[];
  loaded: boolean;
  /** Writes not yet answered by the server (sent or waiting their turn). */
  saving: number;
  loadError: string;
  /** Adding and deleting go into the undo history (Ctrl+Z) unless `undo` is false. */
  create(input: BetInput, undo?: UndoAs): Promise<Bet>;
  /** Creates several bets in one request (all or none). */
  createMany(inputs: BetInput[], undo?: UndoAs): Promise<Bet[]>;
  /** Deletes every bet of a dutch. */
  removeDutch(dutchId: string, undo?: UndoAs): Promise<void>;
  /** The "log as bets" form for a dutch (from the Betting Tool, or Duplicate on a dutch). */
  /** `edit`: editing a logged dutch (BT-12), its id and bets as they were when the form opened. */
  dutchForm: { draft: DutchDraft; key: number; onSaved?: (bets: Bet[]) => void; edit?: { dutchId: string; bets: Bet[] } } | null;
  /** `onSaved` runs after the bets are saved (the Betting Tool clears itself, BT-9). */
  openDutch(draft: DutchDraft, onSaved?: (bets: Bet[]) => void, edit?: { dutchId: string; bets: Bet[] }): void;
  closeDutch(): void;
  /** Not undoable unless `undo` is given (settling records its own steps). */
  update(id: string, patch: Partial<BetInput>, undo?: UndoAs): Promise<Bet>;
  remove(id: string, undo?: UndoAs): Promise<void>;
  /** Puts deleted bets back as they were (ids, timestamps). */
  restore(bets: Bet[]): Promise<void>;
  /** The undo history: `recordUndo` adds a step, `undoGroup` makes everything recorded while `fn` runs one step. */
  recordUndo(step: UndoStep): void;
  undoGroup<T>(label: string, key: string | undefined, fn: () => Promise<T>): Promise<T>;
  /** Undoes the last step (and says so); returns it, so a page can select its row again. */
  undo(): UndoStep | undefined;
  lastUndo: UndoStep | undefined;
  /** Sends a JSON export to the server (adds missing bets only), then reloads all bets. */
  importExport(json: unknown): Promise<{ added: number; skipped: number }>;
  index: SuggestIndex;
  /** Proper name spellings seen in the bets (BT-20), for showing old text the same way. */
  names: NameCasing;
  suggestFor(field: Field, query: string, sport?: string): string[];
  defaults: ReturnType<typeof lastUsed>;
  presets: number[];
  form: FormRequest | null;
  openNew(prefill?: Partial<BetForm>, rollover?: RolloverAdd, ladder?: LadderStart): void;
  openEdit(bet: Bet): void;
  closeForm(): void;
  /** `undoable`: the toast offers Undo (when there is something to undo). */
  toast: { text: string; kind: 'ok' | 'error'; id: number; undoable: boolean } | null;
  notify(text: string, kind?: 'ok' | 'error', undoable?: boolean): void;
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
  // Writes not yet answered: the live server takes ~0.5 s each and they go one at a time, so a fast run of edits can
  // be seconds ahead of the server. Leaving or reloading the page then would drop the rest: the browser asks first.
  const [saving, setSaving] = useState(0);
  const track = useCallback(<T,>(p: () => Promise<T>): Promise<T> => {
    setSaving((n) => n + 1);
    return p().finally(() => setSaving((n) => n - 1));
  }, []);
  const write = useCallback(<T,>(url: string, init: RequestInit) => track(() => writes.write(() => api<T>(url, init))), [writes, track]);
  useEffect(() => {
    const root = document.documentElement;
    if (!saving) {
      delete root.dataset.saving;
      return;
    }
    root.dataset.saving = 'true';
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);

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

  const [, setUndoTick] = useState(0);
  const [history] = useState(() => new UndoHistory(() => setUndoTick((t) => t + 1)));
  // a toast right after an undo step was added offers Undo
  const notify = useCallback(
    (text: string, kind: 'ok' | 'error' = 'ok', undoable?: boolean) =>
      setToast({ text, kind, id: Date.now(), undoable: undoable ?? (kind === 'ok' && Date.now() - history.recordedAt < 1500) }),
    [history],
  );
  const lastUndo = history.peek();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : toast.undoable ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Deleting without an undo step: what undoing an add does.
  const drop = useCallback(
    async (ids: string[]) => {
      const gone = new Set(ids);
      const before = betsRef.current;
      setBets((bs) => bs.filter((b) => !gone.has(b.id)));
      try {
        for (const id of ids) await write(`/api/bets/${id}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify, write],
  );

  const restore = useCallback(
    async (gone: Bet[]) => {
      const back = await write<Bet[]>('/api/bets/restore', { method: 'POST', body: JSON.stringify(gone) }).catch((e: Error) => {
        notify(e.message, 'error');
        throw e;
      });
      const ids = new Set(back.map((b) => b.id));
      setBets((bs) => [...back, ...bs.filter((b) => !ids.has(b.id))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)));
    },
    [notify, write],
  );

  const create = useCallback(
    async (raw: BetInput, undo: UndoAs = {}) => {
      const input = tidyPatch(raw, namesRef.current);
      const bet = await write<Bet>('/api/bets', { method: 'POST', body: JSON.stringify(input) });
      setBets((bs) => [bet, ...bs]);
      if (undo) history.record({ label: undo.label ?? `Added: ${describe(bet)}`, key: undo.key ?? keyOf(bet), revert: () => drop([bet.id]) });
      return bet;
    },
    [write, history, drop],
  );

  const createMany = useCallback(
    async (raw: BetInput[], undo: UndoAs = {}) => {
      const inputs = raw.map((i) => tidyPatch(i, namesRef.current));
      const made = await write<Bet[]>('/api/bets', { method: 'POST', body: JSON.stringify(inputs) });
      setBets((bs) => [...[...made].reverse(), ...bs]);
      if (undo && made.length)
        history.record({
          label: undo.label ?? (made.length === 1 ? `Added: ${describe(made[0]!)}` : `Added ${made.length} bets`),
          key: undo.key ?? keyOf(made[0]!),
          revert: () => drop(made.map((b) => b.id)),
        });
      return made;
    },
    [write, history, drop],
  );

  const removeDutch = useCallback(
    async (dutchId: string, undo: UndoAs = {}) => {
      const before = betsRef.current;
      const gone = before.filter((b) => b.dutchId === dutchId);
      setBets((bs) => bs.filter((b) => b.dutchId !== dutchId));
      try {
        await write(`/api/dutch/${dutchId}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
        return;
      }
      if (undo && gone.length) history.record({ label: undo.label ?? `Deleted a dutch (${gone.length} bets)`, key: undo.key ?? `dutch:${dutchId}`, revert: () => restore(gone) });
    },
    [notify, write, history, restore],
  );

  // undoing an edit patches the bet back (through update itself, without a new undo step)
  const updateRef = useRef<AppCtx['update'] | null>(null);
  const update = useCallback(
    async (id: string, raw: Partial<BetInput>, undo: UndoAs = false) => {
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
        if (undo && before) {
          const back = revertPatch(before, patch);
          history.record({ label: undo.label ?? `Edited: ${describe(before)}`, key: undo.key ?? keyOf(before), revert: () => updateRef.current?.(id, back).catch(() => undefined) });
        }
        return bet;
      } catch (e) {
        if (before && updates.isLatest(id, token)) setBets((bs) => bs.map((b) => (b.id === id ? before : b)));
        notify((e as Error).message, 'error');
        throw e;
      }
    },
    [notify, updates, write, history],
  );
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const remove = useCallback(
    async (id: string, undo: UndoAs = {}) => {
      const before = betsRef.current;
      const gone = before.find((b) => b.id === id);
      setBets((bs) => bs.filter((b) => b.id !== id));
      try {
        await write(`/api/bets/${id}`, { method: 'DELETE' });
      } catch (e) {
        setBets(before);
        notify((e as Error).message, 'error');
        return;
      }
      if (undo && gone) history.record({ label: undo.label ?? `Deleted: ${describe(gone)}`, key: undo.key ?? keyOf(gone), revert: () => restore([gone]) });
    },
    [notify, write, history, restore],
  );

  const undo = useCallback(() => {
    const step = history.undo();
    if (step) notify(`Undone: ${step.label}`, 'ok', false);
    else notify('Nothing to undo', 'error');
    return step;
  }, [history, notify]);
  const undoGroup = useCallback(<T,>(label: string, key: string | undefined, fn: () => Promise<T>) => history.group(label, key, fn), [history]);
  const recordUndo = useCallback((step: UndoStep) => history.record(step), [history]);

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
    const p = track(() => (ppQueue.current.get(batchId) ?? Promise.resolve()).catch(() => undefined).then(run));
    ppQueue.current.set(batchId, p);
    return p;
  }, [track]);
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
    saving,
    loadError,
    create,
    createMany,
    removeDutch,
    dutchForm,
    openDutch: (draft, onSaved, edit) => setDutchForm({ draft, onSaved, edit, key: ++formKey.current }),
    closeDutch: () => setDutchForm(null),
    update,
    remove,
    restore,
    recordUndo,
    undoGroup,
    undo,
    lastUndo,
    importExport,
    index,
    names,
    suggestFor,
    defaults,
    presets,
    form,
    openNew: (prefill, rollover, ladder) => setForm({ mode: 'new', prefill, rollover, ladder, key: ++formKey.current }),
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
