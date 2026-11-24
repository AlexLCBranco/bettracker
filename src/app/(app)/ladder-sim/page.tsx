'use client';

// BT-36: the ladder simulator. Start, odds and rungs on top; one compact row per rung (odds typed over per rung, with
// its tier chip), what the money becomes, the total odds and the fair chance; a target; a random "Try it"; the plan is
// kept in this browser. "Start this ladder" opens the bet form as rung 1 of a real ladder (BT-35).

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { OddsInput } from '@/components/OddsInput';
import { addPlay, DEFAULT_PLAN, formatChance, formatTotal, MAX_RUNGS, MIN_RUNGS, oneIn, planFromLadder, playOnce, readPlan, simulate, type Play, type SimPlan, type Tally } from '@/lib/ladderSim';
import { formatMoney, formatOdds, oddsFromText, parseNumber } from '@/lib/money';
import { tierOf } from '@/lib/rollover';
import { RESULT_LABEL } from '@/lib/types';

const STORAGE_KEY = 'bettracker:ladder-sim';
const noSubscribe = () => () => {};

function loadPlan(): SimPlan {
  try {
    return readPlan(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PLAN;
  }
}

export default function LadderSimPage() {
  // render only in the browser: the plan starts from localStorage
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return inBrowser ? (
    <Suspense fallback={null}>
      <Sim />
    </Suspense>
  ) : null;
}

const CHANCE_TITLE = 'If the odds are fair. Real odds include the book’s margin, so the true chance is a bit lower.';

function Sim() {
  const { bets, loaded, openNew } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [plan, setPlan] = useState<SimPlan>(loadPlan);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)), [plan]);
  const set = <K extends keyof SimPlan>(k: K, v: SimPlan[K]) => setPlan((p) => ({ ...p, [k]: v }));

  // "Open in sim" from a ladder's row: load its real rungs once the bets are here
  const fromLadder = params.get('ladder');
  useEffect(() => {
    if (!fromLadder || !loaded) return;
    const chain = bets.filter((b) => b.rolloverId === fromLadder);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time load from the URL, then the URL is cleared
    if (chain.length) setPlan((p) => planFromLadder(chain, p));
    router.replace('/ladder-sim');
  }, [fromLadder, loaded, bets, router]);

  const sim = useMemo(() => simulate(plan), [plan]);
  const [tally, setTally] = useState<Tally>({ tries: 0, best: 0, reachedGoal: 0 });
  const [play, setPlay] = useState<Play | null>(null);
  const money = plan.money;
  const fm = (n: number) => formatMoney(n, money);
  const maxPays = Math.max(...sim.rows.map((r) => r.pays));
  const bar = (pays: number) => (maxPays > plan.start && pays > 0 ? Math.max(0, Math.log(pays / plan.start) / Math.log(maxPays / plan.start)) : 0);
  const n = sim.rows.length - 1;
  const tryIt = () => {
    const p = playOnce(sim);
    setPlay(p);
    setTally((t) => addPlay(t, p, sim));
  };
  const reset = () => {
    setPlan(DEFAULT_PLAN);
    setPlay(null);
    setTally({ tries: 0, best: 0, reachedGoal: 0 });
  };
  const startLadder = () => {
    const r1 = sim.rows[1]!;
    openNew({ stake: String(plan.start), odds: formatOdds(r1.odds), money }, undefined, { goalRungs: plan.target == null ? n : null, goalAmount: plan.target });
  };

  return (
    <div className="space-y-3" data-testid="ladder-sim">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ladder sim</h1>
          <p className="text-sm text-zinc-400">Plan a ladder rung by rung before betting it: each win puts the whole payout on the next rung.</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Sim money" className="inline-flex rounded-md border border-zinc-700 p-0.5 text-xs">
            {(['real', 'hypothetical'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={money === m} className={`rounded px-2.5 py-1 ${money === m ? (m === 'hypothetical' ? 'bg-violet-500/25 text-violet-200' : 'bg-emerald-500/20 text-white') : 'text-zinc-400 hover:text-white'}`} onClick={() => set('money', m)}>
                {m === 'real' ? 'Real R$' : 'Hypothetical H$'}
              </button>
            ))}
          </div>
          <button className="btn" onClick={reset} title="Clear the plan: start, odds, rungs, notes and target">
            Reset
          </button>
          {!plan.fromLadder && (
            <button className="btn btn-primary" onClick={startLadder} title="Open the bet form as rung 1 of a new ladder, with this plan's rungs or target as its goal">
              Start this ladder
            </button>
          )}
        </div>
      </div>

      {plan.fromLadder && (
        <p className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200" data-testid="from-ladder">
          Planning a real ladder: its {plan.locked.length} placed {plan.locked.length === 1 ? 'rung is' : 'rungs are'} locked; plan the rest. Reset starts a blank plan.
        </p>
      )}

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <F label={`Start (${money === 'real' ? 'R$' : 'H$'})`}>
          <NumberBox value={plan.start} disabled={!!plan.fromLadder} onChange={(v) => v > 0 && set('start', v)} label="Start" />
        </F>
        <F label="Odds">
          <TopOdds value={plan.odds} onChange={(v) => set('odds', v)} />
        </F>
        <F label={`Rungs (${MIN_RUNGS}-${MAX_RUNGS})`}>
          <NumberBox value={plan.rungs} onChange={(v) => set('rungs', Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, Math.round(v))))} label="Rungs" />
        </F>
        <F label={`Target ${money === 'real' ? 'R$' : 'H$'} (optional)`}>
          <NumberBox value={plan.target} allowEmpty onChange={(v) => set('target', v > 0 ? v : null)} label="Target" />
        </F>
        {plan.target != null && (
          <p className="pb-1.5 text-sm text-zinc-300" data-testid="target-info">
            {sim.targetRung != null ? (
              <>
                reached at <b>rung {sim.targetRung}</b>
              </>
            ) : (
              <>not reached in {n} rungs</>
            )}
            {sim.needed != null && (
              <span className="text-zinc-400" data-testid="needed">
                {' · '}needs {sim.needed.toFixed(2)} per rung to reach {fm(plan.target)} in {n} rungs
              </span>
            )}
          </p>
        )}
      </div>

      <section className="card overflow-hidden">
        <table className="w-full table-fixed text-sm" data-testid="sim-table">
          <colgroup>
            <col className="w-14" />
            <col className="w-[150px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[96px]" />
            <col className="w-[130px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] text-zinc-500">
              <th className="px-2 py-1.5 font-medium">Rung</th>
              <th className="px-2 py-1.5 font-medium">Odds</th>
              <th className="px-2 py-1.5 text-right font-medium">Stake in</th>
              <th className="px-2 py-1.5 text-right font-medium">Pays</th>
              <th className="px-2 py-1.5 text-right font-medium">Profit vs start</th>
              <th className="px-2 py-1.5 text-right font-medium">Total odds</th>
              <th className="px-2 py-1.5 text-right font-medium" title={CHANCE_TITLE}>
                Chance ⓘ
              </th>
              <th className="px-2 py-1.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {sim.rows.map((r) => {
              const mark = play && r.rung > 0 ? (r.rung <= play.won ? 'W' : r.rung === play.lostAt ? 'L' : '') : '';
              const isTarget = sim.targetRung === r.rung;
              return (
                <tr
                  key={r.rung}
                  className={`border-t border-zinc-900 ${r.afterTarget ? 'opacity-45' : ''} ${isTarget ? 'outline outline-1 -outline-offset-1 outline-emerald-600/60' : ''}`}
                  style={{ backgroundImage: `linear-gradient(to right, rgba(99,102,241,0.14) ${(bar(r.pays) * 100).toFixed(1)}%, transparent ${(bar(r.pays) * 100).toFixed(1)}%)` }}
                  data-testid="sim-row"
                  data-rung={r.rung}
                  data-after-target={r.afterTarget || undefined}
                >
                  <td className="whitespace-nowrap px-2 py-1 font-semibold text-zinc-200">
                    {r.rung === 0 ? 'Start' : r.rung}
                    {mark && (
                      <span className={`ml-1.5 rounded px-1 text-[10px] font-bold ${mark === 'W' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`} data-testid="try-mark">
                        {mark}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {r.rung === 0 ? (
                      <span className="text-zinc-600">-</span>
                    ) : r.locked ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-testid="locked-rung">
                        <span className="tabular-nums text-zinc-200">{formatOdds(r.odds, 2)}</span>
                        <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-300">{RESULT_LABEL[r.locked]}</span>
                      </span>
                    ) : (
                      <RungOdds
                        rung={r.rung}
                        odds={r.odds}
                        override={r.override}
                        onChange={(o) => set('overrides', { ...plan.overrides, [r.rung]: o })}
                        onReset={() => {
                          const rest = { ...plan.overrides };
                          delete rest[r.rung];
                          set('overrides', rest);
                        }}
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-zinc-400">{r.rung === 0 ? '' : fm(r.stakeIn)}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums text-zinc-100" data-testid="sim-pays">
                    {fm(r.pays)}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${r.profit > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>{r.rung === 0 ? '' : formatMoney(r.profit, money, true)}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-zinc-300" data-testid="sim-total">
                    {formatTotal(r.totalOdds)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-zinc-300" data-testid="sim-chance">
                    {formatChance(r.chance)}
                    {oneIn(r.chance) && <div className="text-[10px] leading-3 text-zinc-500">{oneIn(r.chance)}</div>}
                  </td>
                  <td className="px-2 py-1">
                    <textarea
                      rows={1}
                      className="block w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-zinc-300 [field-sizing:content] hover:border-zinc-800 focus:border-zinc-600 focus:outline-none"
                      placeholder={r.rung === 0 ? 'what this ladder is for' : 'note'}
                      value={plan.notes[r.rung] ?? ''}
                      onChange={(e) => set('notes', { ...plan.notes, [r.rung]: e.target.value })}
                      aria-label={`Note rung ${r.rung}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-sm text-zinc-300" data-testid="sim-summary">
        {fm(plan.start)} → <b>{fm(sim.end)}</b> · {formatTotal(sim.totalOdds)} · {n} {n === 1 ? 'win' : 'wins in a row'} · chance {formatChance(sim.chance)}
        {oneIn(sim.chance) && ` (${oneIn(sim.chance)})`}
      </p>

      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
        <button className="btn" onClick={tryIt} data-testid="try-it">
          {tally.tries ? 'Again' : 'Try it'}
        </button>
        <span className="text-xs text-zinc-500">Random results at the fair chances: a game, not a prediction.</span>
        {play && (
          <span className="text-zinc-300" data-testid="try-result">
            {play.lostAt == null ? `Won all ${n} rungs!` : play.won === 0 ? 'Lost the first rung.' : `Won ${play.won} ${play.won === 1 ? 'rung' : 'rungs'}, lost rung ${play.lostAt}.`}
          </span>
        )}
        {tally.tries > 0 && (
          <span className="ml-auto text-zinc-400" data-testid="try-tally">
            {tally.tries} {tally.tries === 1 ? 'try' : 'tries'}: best rung {tally.best}, reached the goal {tally.reachedGoal} {tally.reachedGoal === 1 ? 'time' : 'times'}
          </span>
        )}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-36 min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

/** A number box that recalculates as you type (comma or dot decimals). */
function NumberBox({ value, onChange, label, allowEmpty, disabled }: { value: number | null; onChange(v: number): void; label: string; allowEmpty?: boolean; disabled?: boolean }) {
  const [text, setText] = useSynced(value, (v) => (v == null ? '' : String(v)), (t) => (t.trim() ? parseNumber(t) : null));
  return (
    <input
      className="field"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        if (allowEmpty && !e.target.value.trim()) return onChange(0);
        const n = parseNumber(e.target.value);
        if (n != null) onChange(n);
      }}
    />
  );
}

/** The top odds box: every rung not typed over follows it. Any odds format. */
function TopOdds({ value, onChange }: { value: number; onChange(v: number): void }) {
  const [text, setText] = useSynced<number>(value, formatOdds, oddsFromText);
  return (
    <OddsInput
      value={text}
      onChange={(t) => {
        setText(t);
        const o = oddsFromText(t);
        if (o != null) onChange(o);
      }}
      aria-label="Odds"
    />
  );
}

/** A rung's odds: dimmed while it follows the top box, bright when typed over, with a reset "x". */
function RungOdds({ rung, odds, override, onChange, onReset }: { rung: number; odds: number; override: boolean; onChange(o: number): void; onReset(): void }) {
  const [text, setText] = useSynced<number>(odds, formatOdds, oddsFromText);
  const tier = tierOf(odds);
  return (
    <span className="flex items-center gap-1">
      <span className="w-16 shrink-0">
        <OddsInput
          value={text}
          onChange={(t) => {
            setText(t);
            const o = oddsFromText(t);
            if (o != null && Math.abs(o - odds) > 1e-9) onChange(o);
          }}
          className={`field px-1.5 py-0.5 text-xs tabular-nums ${override ? 'text-white' : 'text-zinc-500'}`}
          aria-label={`Odds rung ${rung}`}
        />
      </span>
      {override && (
        <button className="px-0.5 text-xs text-zinc-500 hover:text-white" onClick={onReset} aria-label={`Reset odds rung ${rung}`} title="Follow the top odds again">
          x
        </button>
      )}
      {tier && (
        <span className="whitespace-nowrap rounded bg-sky-500/10 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-sky-300" data-testid="sim-tier">
          {tier}
        </span>
      )}
    </span>
  );
}

/**
 * The text of a box showing `value`: kept as typed while it reads as `value`, replaced when `value` changes from
 * elsewhere (Reset, the top odds, a loaded ladder). Never remounts the box, so typing keeps focus.
 */
function useSynced<T>(value: T | null, format: (v: T) => string, parse: (t: string) => T | null): [string, (t: string) => void] {
  const [text, setText] = useState(value == null ? '' : format(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parse(text) !== value) setText(value == null ? '' : format(value));
  }
  return [text, setText];
}
