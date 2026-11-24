'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { Autocomplete } from '@/components/Autocomplete';
import { BetTable } from '@/components/BetTable';
import { DateField } from '@/components/BetFormModal';
import { DataTransfer } from '@/components/DataTransfer';
import { useMoneyScope } from '@/components/Money';
import { isTyping, isUndoKey } from '@/components/Shell';
import { useSettle } from '@/components/useSettle';
import { useRollover } from '@/components/useRollover';
import { chainSummary } from '@/lib/rollover';
import { parseDateInput, todayISO } from '@/lib/dates';
import { countBets } from '@/lib/dutch';
import { filterBets, NO_FILTERS, type Filters } from '@/lib/filters';
import { formatMoney } from '@/lib/money';
import { byMoney } from '@/lib/scope';
import { settleQueue, SETTLE_KEYS, sharedLegOf } from '@/lib/settle';
import { formatPercent, summarize } from '@/lib/stats';
import { RESULT_LABEL, RESULTS, type Bet } from '@/lib/types';
import { isTab, moveKey, nextKey, rowKeys, tabBets, tabDays, TAB_LABEL, TABS, type Tab } from '@/lib/view';

export default function BetsPage() {
  // the tab is in the URL (?tab=settle), read on the client
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}>
      <Bets />
    </Suspense>
  );
}

const HELP: [string, string][] = [
  ['Click', 'Select a row'],
  ['Double click', 'Edit a cell'],
  ['↑ ↓', 'Move the selection'],
  ['W L V', 'Won, lost, void'],
  ['C', 'Cash-out (the amount returned, or a % of the full payout)'],
  ['H J', 'Half-won, half-lost'],
  ['1-9', 'Dutch: toggle a split that won'],
  ['Enter', 'Dutch: confirm (toggled won, rest lost)'],
  ['0', 'Dutch: none won'],
  ['S', 'Dutch: shared leg lost'],
  ['B', 'Bank a won bet for a rollover; on an open shot, close it'],
  ['A', 'Open shot: add the next leg'],
  ['T', 'Label and actual result'],
  ['Ctrl+Z or Z', 'Undo the last change: add, edit, delete, settle, ladder or rollover step'],
  ['N', 'New bet'],
  ['M', 'Insert money (bankroll)'],
  ['?', 'Show these keys'],
];

const DUTCH_KEYS_HELP = 'A dutch settles with 1-9 to toggle the splits that won, then Enter; 0 (none won), V (void all) or S (shared leg lost).';

/**
 * BT-26: the home page. Stats strip, one row of filters, All / Pending / To settle tabs and the bet table. Settling
 * works from the keyboard on the selected row in any tab, as fast as the old Settle queue: after a settle the next row
 * is selected.
 */
function Bets() {
  const { bets: all, loaded, suggestFor, form, dutchForm, moneyForm, notify, lastUndo } = useApp();
  const [scope] = useMoneyScope();
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'all';
  const setTab = (t: Tab) => router.replace(t === 'all' ? '/' : `/?tab=${t}`, { scroll: false });

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  const active = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || fromText || toText;

  const today = todayISO();
  const scoped = useMemo(() => byMoney(all, scope), [all, scope]);
  const filtered = useMemo(() => filterBets(scoped, { ...f, money: '', from: parseDateInput(fromText) ?? '', to: parseDateInput(toText) ?? '' }), [scoped, f, fromText, toText]);
  const days = useMemo(() => tabDays(filtered, tab, today), [filtered, tab, today]);
  const shown = useMemo(() => tabBets(days), [days]);
  const keys = useMemo(() => rowKeys(days), [days]);
  const counts = useMemo(() => ({ pending: rowKeys(tabDays(filtered, 'pending', today)).length, banked: rowKeys(tabDays(filtered, 'banked', today)).length, settle: settleQueue(filtered, today).length }), [filtered, today]);
  const s = summarize(shown);
  const totalCount = countBets(scoped).count;

  // selection: a row key, or a dutch split's "bet:<id>"; the To settle tab starts on its first row, like the old queue
  // the top bar's Banked list opens a shot here: ?tab=banked&sel=rollover:<id>
  const selParam = params.get('sel');
  const [picked, setPicked] = useState<string | null>(selParam);
  const [seenSel, setSeenSel] = useState(selParam);
  if (selParam !== seenSel) {
    setSeenSel(selParam);
    if (selParam) setPicked(selParam);
  }
  const byId = useMemo(() => new Map(shown.map((b) => [b.id, b])), [shown]);
  const valid = (k: string | null) => !!k && (keys.includes(k) || (k.startsWith('bet:') && byId.has(k.slice(4))));
  const selected = valid(picked) ? picked : tab === 'settle' ? (keys[0] ?? null) : null;
  // ↑ ↓ from a split move from its dutch
  const navKey = (k: string | null) => {
    const b = k?.startsWith('bet:') ? byId.get(k.slice(4)) : undefined;
    if (!b || keys.includes(k!)) return k;
    return b.dutchId ? `dutch:${b.dutchId}` : b.rolloverId ? `rollover:${b.rolloverId}` : k;
  };
  const keysRef = useRef(keys);
  const selRef = useRef(selected);
  useEffect(() => {
    keysRef.current = keys;
    selRef.current = selected;
  });
  const settle = useSettle({
    settled: (k) => {
      if (selRef.current !== k) return;
      const next = nextKey(keysRef.current, k);
      if (next) setPicked(next);
    },
    restored: (k) => setPicked(k),
  });
  const rollover = useRollover(settle);

  const [help, setHelp] = useState(false);
  // BT-27: the row whose label / actual editor is open; it never opens on its own (settling stays W / L / V)
  const [annotating, setAnnotating] = useState<string | null>(null);
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    handler.current = (e) => {
      if (form || dutchForm || moneyForm || isTyping(e)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role=dialog], [role=menu]')) return;
      if (isUndoKey(e)) {
        e.preventDefault();
        return settle.undo();
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === '?') {
        e.preventDefault();
        return setHelp((h) => !h);
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        return setPicked(moveKey(keys, navKey(selected), k === 'ArrowDown' ? 1 : -1));
      }
      if (k === 'Escape') {
        if (help) setHelp(false);
        else setPicked(null);
        return;
      }
      if (k === 'z') {
        e.preventDefault();
        return settle.undo();
      }
      if (!selected) return;
      if (k === 't') {
        e.preventDefault();
        return setAnnotating(selected);
      }
      // BT-29: a rollover shot, or a bet in one: B banks / closes, A adds a leg, W / L / V settle its pending bet
      const sel = selected.startsWith('bet:') ? byId.get(selected.slice(4)) : undefined;
      const chainId = selected.startsWith('rollover:') ? selected.slice(9) : sel?.rolloverId;
      const chain = chainId ? all.filter((b) => b.rolloverId === chainId) : [];
      if (k === 'b') {
        e.preventDefault();
        if (chain.length && chainSummary(chain).outcome === 'open') return rollover.close(chain);
        const target = sel ?? (chain.length ? chainSummary(chain).bets.at(-1) : undefined);
        if (target) return rollover.bank(target);
        return notify('B banks a won bet', 'error');
      }
      if (k === 'a' && chain.length) {
        e.preventDefault();
        return rollover.addLeg(chain);
      }
      if (selected.startsWith('rollover:')) {
        if (!(k in SETTLE_KEYS)) return;
        e.preventDefault();
        const p = chain.find((b) => b.result === 'pending');
        if (!p) return notify('Nothing pending in this shot: settle its bets on their own rows', 'error');
        if (k === 'c') settle.startCashout(p.id);
        else settle.settleBet(p, SETTLE_KEYS[k]!, null, [p]);
        return;
      }
      if (selected.startsWith('dutch:')) {
        const dutchId = selected.slice(6);
        const bets = shown.filter((b) => b.dutchId === dutchId);
        const pending = bets.filter((b) => b.result === 'pending');
        if (!pending.length) return;
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          if (Number(k) <= pending.length) settle.toggleWinner(dutchId, Number(k) - 1);
        } else if (k === 'Enter') {
          e.preventDefault();
          settle.settleDutch(dutchId, bets, settle.winners(dutchId));
        } else if (k === '0') {
          e.preventDefault();
          settle.settleDutch(dutchId, bets, 'none');
        } else if (k === 'v') {
          e.preventDefault();
          settle.settleDutch(dutchId, bets, 'void');
        } else if (k === 's') {
          e.preventDefault();
          const sl = sharedLegOf({ kind: 'dutch', key: dutchId, dutchId, bets, pending });
          if ('error' in sl) notify(sl.error, 'error');
          else settle.settleDutch(dutchId, bets, 'shared');
        } else if (k in SETTLE_KEYS) {
          e.preventDefault();
          notify(DUTCH_KEYS_HELP, 'error');
        }
        return;
      }
      const b: Bet | undefined = byId.get(selected.slice(4));
      if (!b || !(k in SETTLE_KEYS)) return;
      e.preventDefault();
      if (b.result !== 'pending') return notify(`Already settled (${RESULT_LABEL[b.result]}): change it on its result pill`, 'error');
      if (k === 'c') settle.startCashout(b.id);
      else settle.settleBet(b, SETTLE_KEYS[k]!, null, b.dutchId ? shown.filter((x) => x.dutchId === b.dutchId) : [b]);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (selected) document.querySelector(`[data-key="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const fmt = (n: number, signed = false) => formatMoney(n, scope, signed);
  const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-200');

  return (
    <div className="space-y-3">
      <h1 className="sr-only">Bets</h1>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400" data-testid="stats">
        <Stat label="Net" testId="stat-net" value={<span className={tone(s.netProfit)}>{fmt(s.netProfit, true)}</span>} sub={`on ${fmt(s.settledStake)} settled`} />
        <Stat label="ROI" testId="stat-roi" value={<span className={tone(s.roi ?? 0)}>{formatPercent(s.roi, true)}</span>} />
        <Stat label="Wagered" testId="stat-wagered" value={fmt(s.totalWagered)} sub={`${s.betCount} of ${totalCount} ${totalCount === 1 ? 'bet' : 'bets'}`} />
        <Stat label="Win rate" testId="stat-winrate" value={formatPercent(s.winRate)} sub={`${s.wins}W / ${s.losses}L`} />
        {/* BT-33: bonus bets: the bonus spent and the real money it turned into */}
        {(s.bonusSpent > 0 || s.bonusPending > 0) && (
          <Stat
            label="Bonus"
            testId="stat-bonus"
            value={<span className="text-amber-300">{formatMoney(s.bonusSpent, 'bonus')}</span>}
            sub={`spent · won ${formatMoney(s.bonusWon, 'real')} · converted ${formatPercent(s.bonusConverted)}${s.bonusPending > 0 ? ` · ${formatMoney(s.bonusPending, 'bonus')} pending` : ''}`}
          />
        )}
        <Stat
          label="Pending"
          testId="stat-pending"
          value={
            <button className="hover:underline" onClick={() => setTab('settle')} title="Open the To settle tab">
              {s.pendingCount}
            </button>
          }
          sub={fmt(s.pendingAmount)}
        />
      </div>

      <div className="flex items-end gap-2" data-testid="filters">
        <F label="From" w="w-28">
          <DateField value={fromText} onChange={setFromText} aria-label="From date" />
        </F>
        <F label="To" w="w-28">
          <DateField value={toText} onChange={setToText} aria-label="To date" />
        </F>
        <F label="Book" w="min-w-0 flex-1">
          <Autocomplete value={f.book} onChange={(v) => set('book', v)} getSuggestions={(q) => suggestFor('book', q)} aria-label="Filter book" />
        </F>
        <F label="Sport" w="min-w-0 flex-1">
          <Autocomplete value={f.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Filter sport" />
        </F>
        <F label="Type" w="w-32">
          <select className="field" value={f.type} onChange={(e) => set('type', e.target.value as Filters['type'])} aria-label="Filter type">
            <option value="">All</option>
            <option value="solo">Solo</option>
            <option value="combination">Combination</option>
            <option value="dutch">Dutch</option>
          </select>
        </F>
        <F label="Situation" w="w-28">
          <select className="field" value={f.situation} onChange={(e) => set('situation', e.target.value as Filters['situation'])} aria-label="Filter situation">
            <option value="">All</option>
            <option value="pregame">Pregame</option>
            <option value="live">Live</option>
          </select>
        </F>
        <F label="Result" w="w-28">
          <select className="field" value={f.result} onChange={(e) => set('result', e.target.value as Filters['result'])} aria-label="Filter result">
            <option value="">All</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </F>
        <F label="Search" w="min-w-0 flex-[1.5]">
          <input className="field" value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="bet, game, selection" aria-label="Search bets" />
        </F>
        <button
          className="btn"
          disabled={!active}
          onClick={() => {
            setF(NO_FILTERS);
            setFromText('');
            setToText('');
          }}
        >
          Clear
        </button>
        <Popover label="Export and import" icon="⋯">
          <DataTransfer vertical />
        </Popover>
        <Popover label="Keyboard shortcuts" icon="?" open={help} onOpen={setHelp}>
          <dl className="grid w-72 grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs" data-testid="key-help">
            {HELP.map(([k, l]) => (
              <Fragment key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd className="text-zinc-300">{l}</dd>
              </Fragment>
            ))}
          </dl>
        </Popover>
      </div>

      <div role="tablist" aria-label="Show" className="flex items-center gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === t ? 'border-emerald-500 font-semibold text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
            {t === 'pending' && counts.pending > 0 && <span className="ml-1.5 text-xs text-zinc-500">{counts.pending}</span>}
            {t === 'banked' && counts.banked > 0 && (
              <span className="ml-1.5 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-xs font-semibold text-sky-200" data-testid="banked-tab-count">
                {counts.banked}
              </span>
            )}
            {t === 'settle' && counts.settle > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black" data-testid="settle-count">
                {counts.settle}
              </span>
            )}
          </button>
        ))}
        {settle.canUndo && lastUndo && (
          <button className="ml-auto max-w-md truncate text-xs text-zinc-400 hover:text-white" title={`Undo: ${lastUndo.label} (Ctrl+Z or Z)`} onClick={settle.undo} data-testid="undo-last">
            ↶ Undo: {lastUndo.label} <span className="text-zinc-600">· Ctrl+Z</span>
          </button>
        )}
      </div>

      <section className="card px-2 pb-2">
        {loaded ? (
          <BetTable
            days={days}
            selected={selected}
            select={setPicked}
            settle={settle}
            annotating={annotating}
            annotate={setAnnotating}
            rollover={rollover}
            empty={tab === 'settle' ? 'Nothing to settle.' : tab === 'pending' ? 'No pending bets.' : tab === 'banked' ? 'Nothing banked: Bank a won bet to roll its payout on.' : all.length ? 'No bets match these filters.' : undefined}
          />
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: string; testId: string }) {
  return (
    <div className="flex items-baseline gap-1.5" data-testid={testId}>
      <span>{label}</span>
      <span className="text-sm font-semibold tabular-nums text-zinc-100" data-testid={`${testId}-value`}>
        {value}
      </span>
      {sub && <span className="text-zinc-500">{sub}</span>}
    </div>
  );
}

function F({ label, w, children }: { label: string; w: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-0.5 ${w}`}>
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

/** A small button with a panel under it (the "⋯" export menu, the "?" keys). Stays mounted, so an import keeps its file box. */
function Popover({ label, icon, children, open: controlled, onOpen }: { label: string; icon: string; children: ReactNode; open?: boolean; onOpen?(o: boolean): void }) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = onOpen ?? setOwn;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, setOpen]);
  return (
    <div ref={box} className="relative">
      <button className="btn w-9 justify-center" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
      </button>
      <div role="dialog" aria-label={label} hidden={!open} className="absolute right-0 top-full z-40 mt-1 rounded-md border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
        {children}
      </div>
    </div>
  );
}
