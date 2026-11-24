'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { OutcomeTable } from '@/components/OutcomeTable';
import { newDutchDraft } from '@/lib/dutch';
import { combinedOdds, dutch, formatAmerican, outcomeTable, solveTarget, type DutchError } from '@/lib/dutching';
import { formatBRL, formatMoney, formatOdds, ODDS_FORMAT_LABEL, ODDS_FORMATS, parseOdds, type OddsFormat } from '@/lib/money';
import { previewText, readStake } from '@/lib/units';
import { sharedUsed, showsLegs, splitCalc, type LegText, type SplitText } from '@/lib/splits';
import { formatPercent } from '@/lib/stats';

interface ToolState {
  stake: string;
  step: 0.01 | 1;
  rows: SplitText[];
  /** Legs that are part of every split, typed once. Missing in calculations saved before BT-5. */
  shared?: LegText[];
  /** BT-40: "target" solves the one split left with empty odds for a wanted combined odds. Missing = "dutch". */
  mode?: 'dutch' | 'target';
  /** The combined odds wanted, as typed, and how to read it. */
  target?: string;
  targetFormat?: OddsFormat;
  /** The odds the book really offers on the solved split ("What I found"), any format. */
  found?: string;
}

const STORAGE_KEY = 'bettracker.dutching';
const blank = (id: number, format: OddsFormat = 'auto'): SplitText => ({
  id,
  name: '',
  odds: '',
  format,
});
const blankLeg = (id: number): LegText => ({
  id,
  name: '',
  odds: '',
  format: 'auto',
});
const nextId = (xs: { id: number }[] | undefined) => Math.max(0, ...(xs ?? []).map((x) => x.id)) + 1;
const INITIAL: ToolState = {
  stake: '100',
  step: 0.01,
  rows: [blank(1), blank(2), blank(3)],
  shared: [],
};

const ERROR_TEXT: Record<DutchError, string> = {
  stake: 'Enter a total stake above zero.',
  'too-few': 'Enter odds for at least two selections.',
  odds: 'Every odds value must be readable and above 1.00 as decimal odds.',
};

/** The last calculation, kept across visits in this browser. */
function loadSaved(): ToolState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as ToolState | null;
    if (saved?.rows?.length) return saved;
  } catch {
    // ignore a corrupt entry
  }
  return INITIAL;
}

const noSubscribe = () => () => {};

export default function BettingToolPage() {
  // render only in the browser, so the tool can start from localStorage without a server/client mismatch
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return inBrowser ? <Tool /> : null;
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_7rem_7.5rem_2rem] gap-2';

/** What "Clear all" leaves: no selections or shared legs; the total stake and rounding are kept. */
const cleared = (s: ToolState): ToolState => ({ ...INITIAL, stake: s.stake, step: s.step, mode: s.mode, target: s.target, targetFormat: s.targetFormat });

function Tool() {
  const { defaults, openDutch, units } = useApp();
  const [s, setS] = useState<ToolState>(loadSaved);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(s)), [s]);
  // BT-9: after a dutch is logged the tool clears; this keeps what it held, for "Undo clear". Shown while the tool is
  // still exactly as it was cleared (any edit hides it) and for 8 s at most.
  const [logged, setLogged] = useState<{ count: number; stake: number; before: ToolState; after: ToolState } | null>(null);
  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => setLogged(null), 8000);
    return () => clearTimeout(t);
  }, [logged]);
  const showLogged = logged && s === logged.after ? logged : null;

  const setRow = (id: number, patch: Partial<SplitText>) =>
    setS((x) => ({
      ...x,
      rows: x.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const addRow = () => setS((x) => ({ ...x, rows: [...x.rows, blank(nextId(x.rows))] }));
  const removeRow = (id: number) =>
    setS((x) => ({
      ...x,
      rows: x.rows.length > 2 ? x.rows.filter((r) => r.id !== id) : x.rows.map((r) => (r.id === id ? blank(r.id, r.format) : r)),
    }));
  const setLegs = (id: number, f: (legs: LegText[]) => LegText[]) =>
    setS((x) => ({
      ...x,
      rows: x.rows.map((r) => (r.id === id ? { ...r, legs: f(r.legs ?? []) } : r)),
    }));
  const setShared = (f: (legs: LegText[]) => LegText[]) => setS((x) => ({ ...x, shared: f(x.shared ?? []) }));

  const calcs = new Map(s.rows.map((r) => [r.id, splitCalc(r, s.shared)]));
  // splits with nothing typed in their odds are left out; anything typed must be valid
  const used = s.rows.filter((r) => calcs.get(r.id)!.used);
  // unrounded decimal odds (a combination split's total odds): the maths and the logged bets use these
  const oddsValues = used.map((r) => calcs.get(r.id)!.odds);
  // BT-38: the total stake can be typed in units ("2u", real money's unit size; "H$2u" hypothetical)
  const typed = readStake(s.stake, 'real', units.unitSizes);
  const stake = typed?.ok ? typed.amount : NaN;
  const unitHint = typed && (!typed.ok ? { ok: false, text: typed.error } : typed.units != null ? { ok: true, text: previewText(typed.units, typed.amount, typed.money, formatMoney) } : null);
  const result = dutch(stake, oddsValues, s.step);
  const byId = new Map(used.map((r, i) => [r.id, i]));
  const ok = 'error' in result ? null : result;

  /** What a split is called: its legs joined with " + " when it is a combination. */
  const splitName = (r: SplitText) => {
    const n = s.rows.indexOf(r) + 1;
    const c = calcs.get(r.id)!;
    if (!c.combo) return r.name.trim() || `Selection ${n}`;
    return c.legs.map((l, k) => l.name || (k === 0 ? `Selection ${n}` : `Leg ${k + 1}`)).join(' + ');
  };

  // ---- BT-40: target odds mode ----
  const mode = s.mode ?? 'dutch';
  // the split being solved: the first one with nothing typed in its odds (other empty ones are left out)
  const missing = mode === 'target' ? s.rows.find((r) => !calcs.get(r.id)!.used) : undefined;
  const targetP = parseOdds(s.target ?? '', s.targetFormat ?? 'auto');
  const solve = mode === 'target' && missing && targetP ? solveTarget(oddsValues, targetP.decimal) : null;
  const solved = solve?.ok ? solve : null;
  const foundP = solved && (s.found ?? '').trim() ? parseOdds(s.found!, 'auto') : null;
  /** Odds per split in row order, the solved split filled in with `missingOdds`. */
  const withMissing = (missingOdds: number) => s.rows.flatMap((r) => (r === missing ? [missingOdds] : byId.has(r.id) ? [oddsValues[byId.get(r.id)!]!] : []));
  const targetRows = missing ? s.rows.filter((r) => r === missing || byId.has(r.id)) : [];
  const targetMessage = (() => {
    if (mode !== 'target') return null;
    if (!(s.target ?? '').trim()) return 'Enter the combined odds you want.';
    if (!targetP) return 'Cannot read the target odds.';
    if (!missing) return 'Leave one selection’s odds empty: that is the split the tool solves.';
    if (!solve || solve.ok) return null;
    if (solve.error === 'too-high') return `Not possible: with these odds the combined odds can only go up to ${formatOdds(solve.limit, 2)}. Any target below ${formatOdds(solve.limit, 2)} works.`;
    if (solve.error === 'known') return 'Enter the odds of at least one other split; every odds value must be readable and above 1.00.';
    return 'The target must be above 1.00 as decimal odds.';
  })();
  /** Hand-off: the found odds (or the needed odds) go into the solved split and the tool switches to the dutch. */
  const useInDutch = () => {
    if (!solved || !missing) return;
    const text = foundP ? s.found!.trim() : formatOdds(solved.needed, 2);
    const combo = calcs.get(missing.id)!.combo;
    setS((x) => ({
      ...x,
      mode: 'dutch',
      found: '',
      rows: x.rows.map((r) => (r.id !== missing.id ? r : combo ? { ...r, total: text } : { ...r, odds: text, format: 'auto' })),
    }));
  };

  const sharedCount = sharedUsed(s.shared).length;
  const outcomes = ok ? outcomeTable(stake, ok.stakes, oddsValues, sharedCount > 0) : [];

  const logAsBets = () => {
    if (!ok) return;
    const before = s;
    // the split's own legs; its shared legs (the last `sharedCount` of a combination's legs) go to the draft once
    const legName = (name: string, k: number, n: number) => name || (k === 0 ? `Selection ${n}` : `Leg ${k + 1}`);
    const first = used[0] ? calcs.get(used[0].id)! : null;
    const sharedLegs = first?.combo ? first.legs.slice(first.legs.length - sharedCount).map((l, k) => ({ selection: l.name || `Shared leg ${k + 1}`, odds: l.odds })) : [];
    openDutch(
      newDutchDraft(
        used.map((r, i) => {
          const c = calcs.get(r.id)!;
          const n = s.rows.indexOf(r) + 1;
          const own = c.combo ? c.legs.slice(0, c.legs.length - sharedCount) : c.legs;
          return {
            selection: splitName(r),
            odds: oddsValues[i]!,
            stake: ok.stakes[i]!,
            legs: own.map((l, k) => ({ selection: legName(l.name, k, n), odds: c.combo ? l.odds : oddsValues[i]! })),
          };
        }),
        defaults,
        undefined,
        sharedLegs,
      ),
      (bets) => {
        const after = cleared(before);
        setS(after);
        setLogged({ count: bets.length, stake: bets.reduce((t, b) => t + b.stake, 0), before, after });
      },
    );
  };

  const shared = s.shared ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Betting Tool</h1>
        <p className="text-sm text-zinc-400">
          Dutching: split a total stake across several selections so every one returns the same amount. Odds in any format: decimal, American (+220), fractional (5/2), Hong Kong, Indonesian, Malay or
          probability (40%). A selection can be a combination: add legs to it, or a shared leg that is part of every selection.
        </p>
      </div>

      {showLogged && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-800 bg-emerald-950 px-4 py-2 text-sm text-emerald-200" data-testid="dutch-logged">
          <span>
            Dutch logged: {showLogged.count} bets, {formatBRL(showLogged.stake)}
          </span>
          <span className="text-emerald-700">·</span>
          <Link href="/" className="underline hover:text-white">
            View in Bets
          </Link>
          <span className="text-emerald-700">·</span>
          <button
            className="underline hover:text-white"
            onClick={() => {
              setS(showLogged.before);
              setLogged(null);
            }}
          >
            Undo clear
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card space-y-4 p-5">
          <div className="flex gap-1 rounded-md border border-zinc-800 p-1 text-sm" role="group" aria-label="Betting Tool mode">
            {(['dutch', 'target'] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 rounded px-3 py-1 ${mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                aria-pressed={mode === m}
                onClick={() => setS((x) => ({ ...x, mode: m }))}
                title={m === 'target' ? 'Type the odds you have and the combined odds you want: the tool tells you what the missing split needs' : 'Split a total stake across selections'}
              >
                {m === 'dutch' ? 'Dutch' : 'Target odds'}
              </button>
            ))}
          </div>
          {mode === 'target' && (
            <div className="space-y-1">
              <div className={ROW_GRID}>
                <span className="self-center text-sm text-zinc-300">Target combined odds</span>
                <input
                  className={`field tabular-nums ${(s.target ?? '').trim() && !targetP ? 'border-red-500' : ''}`}
                  value={s.target ?? ''}
                  placeholder="1.60"
                  onChange={(e) => setS((x) => ({ ...x, target: e.target.value }))}
                  aria-label="Target combined odds"
                />
                <select className="field" value={s.targetFormat ?? 'auto'} onChange={(e) => setS((x) => ({ ...x, targetFormat: e.target.value as OddsFormat }))} aria-label="Target odds format">
                  {ODDS_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {ODDS_FORMAT_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              {targetP && !targetP.plain && <p className="pl-1 text-xs text-zinc-400">= {formatOdds(targetP.decimal)} decimal · {targetP.label}</p>}
              <p className="text-xs text-zinc-500">Leave one selection’s odds empty: the tool works out what it needs. The total stake is optional.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Label text="Total stake (R$)">
              <span className="relative flex flex-col">
                <input className="field" inputMode="decimal" value={s.stake} onChange={(e) => setS((x) => ({ ...x, stake: e.target.value }))} aria-label="Total stake" title='An amount, or units: "2u"' />
                {unitHint && (
                  <span className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 truncate rounded bg-zinc-900 px-1 text-[11px] tabular-nums ${unitHint.ok ? 'text-sky-300' : 'text-amber-300'}`} style={{ maxWidth: '90%' }} title={unitHint.text} data-testid="unit-preview">
                    {unitHint.text}
                  </span>
                )}
              </span>
            </Label>
            <Label text="Round stakes to">
              <select
                className="field"
                value={s.step}
                onChange={(e) =>
                  setS((x) => ({
                    ...x,
                    step: Number(e.target.value) as ToolState['step'],
                  }))
                }
                aria-label="Round stakes to"
              >
                <option value={0.01}>R$ 0,01</option>
                <option value={1}>R$ 1</option>
              </select>
            </Label>
          </div>

          <div className="rounded-md border border-zinc-800 p-3" data-testid="shared-legs">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Shared legs {shared.length ? '(part of every selection)' : ''}</span>
              <button className="text-zinc-300 hover:text-white" onClick={() => setShared((l) => [...l, blankLeg(nextId(l))])}>
                + Shared leg
              </button>
            </div>
            <div className="space-y-2">
              {shared.map((l, k) => (
                <LegLine
                  key={l.id}
                  leg={l}
                  label={`Shared leg ${k + 1}`}
                  placeholder={`Shared leg ${k + 1}`}
                  onChange={(patch) => setShared((ls) => ls.map((x) => (x.id === l.id ? { ...x, ...patch } : x)))}
                  onRemove={() => setShared((ls) => ls.filter((x) => x.id !== l.id))}
                />
              ))}
            </div>
          </div>

          <div>
            <div className={`mb-1 ${ROW_GRID} text-xs text-zinc-400`}>
              <span>Selection</span>
              <span>Odds</span>
              <span>Format</span>
            </div>
            <div className="space-y-3">
              {s.rows.map((r, n) => {
                const c = calcs.get(r.id)!;
                const withLegs = showsLegs(r, s.shared);
                const legs = r.legs ?? [];
                return (
                  <div key={r.id} data-testid="dutch-input-row" className={withLegs ? 'rounded-md border border-zinc-800 p-2' : ''}>
                    <LegLine
                      leg={r}
                      label={`Selection ${n + 1}`}
                      placeholder={`Selection ${n + 1}`}
                      onChange={(patch) => setRow(r.id, patch)}
                      onRemove={() => removeRow(r.id)}
                      removeTitle={s.rows.length > 2 ? 'Remove' : 'Clear'}
                      removeLabel={`Remove selection ${n + 1}`}
                    />
                    {legs.map((l, k) => (
                      <div key={l.id} className="mt-2 pl-4">
                        <LegLine
                          leg={l}
                          label={`Selection ${n + 1} leg ${k + 2}`}
                          placeholder={`Leg ${k + 2}`}
                          onChange={(patch) => setLegs(r.id, (ls) => ls.map((x) => (x.id === l.id ? { ...x, ...patch } : x)))}
                          onRemove={() => setLegs(r.id, (ls) => ls.filter((x) => x.id !== l.id))}
                        />
                      </div>
                    ))}
                    {r === missing && (
                      <div className="mt-2 rounded-md border border-sky-900 bg-sky-950/40 p-2 text-sm" data-testid="target-missing">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sky-300">Solving this split</span>
                          {solved && (
                            <span className="tabular-nums text-zinc-200">
                              needs <b>{formatOdds(solved.needed, 2)}</b> ({formatAmerican(solved.needed)})
                            </span>
                          )}
                        </div>
                        {solved && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                            <span className="shrink-0">What I found</span>
                            <input
                              className={`field w-28 py-0.5 tabular-nums ${(s.found ?? '').trim() && !foundP ? 'border-red-500' : ''}`}
                              value={s.found ?? ''}
                              placeholder={formatOdds(solved.needed, 2)}
                              onChange={(e) => setS((x) => ({ ...x, found: e.target.value }))}
                              aria-label="What I found odds"
                            />
                            {foundP && !foundP.plain && <span>= {formatOdds(foundP.decimal)}</span>}
                            {(s.found ?? '').trim() && !foundP && <span className="text-red-400">Cannot read these odds</span>}
                          </label>
                        )}
                      </div>
                    )}
                    {withLegs && shared.length > 0 && <p className="mt-1 pl-4 text-xs text-zinc-500">+ shared: {shared.map((l, k) => l.name.trim() || `Shared leg ${k + 1}`).join(', ')}</p>}
                    <div className="mt-1 flex items-center gap-3 pl-1 text-xs">
                      <button className="text-zinc-400 hover:text-white" onClick={() => setLegs(r.id, (ls) => [...ls, blankLeg(nextId(ls))])} aria-label={`Add leg to selection ${n + 1}`}>
                        + leg
                      </button>
                      {withLegs && c.combo && (c.used || r.name.trim() !== '') && (
                        <TotalOdds row={r} n={n} estimate={c.estimate} estimated={c.estimated} onChange={(total) => setRow(r.id, { total })} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn" onClick={addRow}>
              + Add selection
            </button>
            <button className="btn" onClick={() => setS(cleared(s))}>
              Clear all
            </button>
            {mode === 'target' ? (
              <button className="btn btn-primary ml-auto" disabled={!solved} onClick={useInDutch} title={solved ? 'Fill the dutch calculator with these splits and odds (what you found, or the needed odds)' : 'Needs a solved target'}>
                Use in dutch
              </button>
            ) : (
              <button className="btn btn-primary ml-auto" disabled={!ok} onClick={logAsBets} title={ok ? 'Save one pending bet per selection, linked as one dutch' : 'Needs a valid calculation'}>
                Log as bets
              </button>
            )}
          </div>
        </section>

        {mode === 'target' ? (
          <section className="card space-y-4 p-5" data-testid="target-result">
            {targetMessage || !solved || !missing ? (
              <p className="py-10 text-center text-sm text-zinc-500" role={solve && !solve.ok ? 'alert' : undefined} data-testid="target-message">
                {targetMessage ?? 'Enter the odds of the other splits.'}
              </p>
            ) : (
              <TargetResult
                needed={solved.needed}
                target={solved.target}
                found={foundP?.decimal ?? null}
                stake={stake}
                step={s.step}
                rows={targetRows.map((r) => ({ id: r.id, name: splitName(r), solved: r === missing }))}
                odds={withMissing(foundP?.decimal ?? solved.needed)}
              />
            )}
          </section>
        ) : (
        <section className="card space-y-4 p-5" data-testid="dutch-result">
          {!ok ? (
            <p className="py-10 text-center text-sm text-zinc-500" data-testid="dutch-error">
              {ERROR_TEXT[(result as { error: DutchError }).error]}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                <Tile label="Every selection returns" testId="dutch-return" sub={ok.maxReturn > ok.minReturn ? `up to ${formatBRL(ok.maxReturn)}` : undefined}>
                  {formatBRL(ok.minReturn)}
                </Tile>
                <Tile label="Profit if 1 wins" testId="dutch-profit" sub={ok.maxProfit > ok.minProfit ? `up to ${formatBRL(ok.maxProfit, true)}` : undefined}>
                  <span className={ok.minProfit > 0 ? 'text-emerald-400' : ok.minProfit < 0 ? 'text-red-400' : ''}>{formatBRL(ok.minProfit, true)}</span>
                </Tile>
                <Tile label="Combined odds" testId="dutch-odds" sub={`book ${formatPercent(ok.book)}`}>
                  {formatOdds(ok.combinedOdds, 2)}
                </Tile>
              </div>
              {ok.book >= 1 && (
                <p role="alert" className="rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-300">
                  These odds add up to {formatPercent(ok.book)}, which is 100% or more: you lose money whichever selection wins.
                </p>
              )}
              <table className="w-full text-sm" aria-label="Stake per selection">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                    <th className="py-2 pr-3 font-medium">Selection</th>
                    <th className="px-3 py-2 text-right font-medium">Odds</th>
                    <th className="px-3 py-2 text-right font-medium">Stake</th>
                    <th className="px-3 py-2 text-right font-medium">Share</th>
                    <th className="py-2 pl-3 text-right font-medium">Returns</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => {
                    const i = byId.get(r.id);
                    if (i == null) return null;
                    return (
                      <tr key={r.id} className="border-b border-zinc-900" data-testid="dutch-row">
                        <td className="py-2 pr-3 text-zinc-100">{splitName(r)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatOdds(oddsValues[i])}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-white" data-testid="dutch-stake">
                          {formatBRL(ok.stakes[i]!)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatPercent(ok.stakes[i]! / stake)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums" data-testid="dutch-row-return">
                          {formatBRL(ok.returns[i]!)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-zinc-500">Lower odds get more of the stake. Rounding can make returns differ by a few centavos.</p>
              <div className="border-t border-zinc-800 pt-4">
                <OutcomeTable rows={outcomes} />
              </div>
            </>
          )}
        </section>
        )}
      </div>
    </div>
  );
}

/** BT-40: the needed odds; with a total stake, the stake per split and the equal return; with "what I found", the
 *  real combined odds next to the target and the stakes for those real odds. `odds` is per row, solved one filled. */
function TargetResult(props: { needed: number; target: number; found: number | null; stake: number; step: 0.01 | 1; rows: { id: number; name: string; solved: boolean }[]; odds: number[] }) {
  const { needed, target, found, odds } = props;
  const real = found != null ? combinedOdds(odds) : null;
  const d = props.stake > 0 ? dutch(props.stake, odds, props.step) : null;
  const split = d && !('error' in d) ? d : null;
  const diff = real == null ? 0 : real - target;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Tile label="Missing split needs" testId="target-needed" sub="decimal · American">
          {formatOdds(needed, 2)} <span className="text-base font-semibold text-zinc-400">{formatAmerican(needed)}</span>
        </Tile>
        <Tile label={real == null ? 'Target combined odds' : 'Real combined odds'} testId="target-combined" sub={real == null ? undefined : `target ${formatOdds(target, 2)}`}>
          {real == null ? (
            formatOdds(target, 2)
          ) : (
            <>
              {formatOdds(real, 2)}{' '}
              <span className={`text-sm font-semibold ${Math.abs(diff) < 0.005 ? 'text-zinc-400' : diff > 0 ? 'text-emerald-400' : 'text-amber-300'}`} data-testid="target-vs">
                {Math.abs(diff) < 0.005 ? 'on target' : diff > 0 ? `above by ${formatOdds(diff, 2)}` : `below by ${formatOdds(-diff, 2)}`}
              </span>
            </>
          )}
        </Tile>
        {split && (
          <Tile label="Every split returns" testId="target-return" sub="± a few centavos of rounding">
            {formatBRL(Math.round(props.stake * combinedOdds(odds) * 100) / 100)}
          </Tile>
        )}
      </div>
      {split ? (
        <table className="w-full text-sm" aria-label="Stake per split">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
              <th className="py-2 pr-3 font-medium">Selection</th>
              <th className="px-3 py-2 text-right font-medium">Odds</th>
              <th className="px-3 py-2 text-right font-medium">Stake</th>
              <th className="px-3 py-2 text-right font-medium">Share</th>
              <th className="py-2 pl-3 text-right font-medium">Returns</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r, i) => (
              <tr key={r.id} className="border-b border-zinc-900" data-testid="target-row">
                <td className="py-2 pr-3 text-zinc-100">
                  {r.name}
                  {r.solved && <span className="ml-2 text-xs text-sky-300">{found != null ? 'found' : 'needed'}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatOdds(odds[i], 2)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-white" data-testid="target-stake">
                  {formatBRL(split.stakes[i]!)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatPercent(split.stakes[i]! / props.stake)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{formatBRL(split.returns[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-zinc-500">Type a total stake to see the stake per split and what each returns.</p>
      )}
    </>
  );
}

/** One name + odds + format line (a selection, one of its legs, or a shared leg), with the converted odds under it. */
function LegLine(props: { leg: LegText; label: string; placeholder: string; onChange(patch: Partial<LegText>): void; onRemove(): void; removeTitle?: string; removeLabel?: string }) {
  const { leg: r, label } = props;
  const p = parseOdds(r.odds, r.format ?? 'auto');
  const typed = r.odds.trim() !== '';
  return (
    <div>
      <div className={ROW_GRID}>
        <input className="field" value={r.name} placeholder={props.placeholder} onChange={(e) => props.onChange({ name: e.target.value })} aria-label={`${label} name`} />
        <input
          className={`field tabular-nums ${typed && !p ? 'border-red-500' : ''}`}
          value={r.odds}
          placeholder="2.10"
          onChange={(e) => props.onChange({ odds: e.target.value })}
          aria-label={`${label} odds`}
          aria-invalid={typed && !p}
        />
        <select className="field" value={r.format ?? 'auto'} onChange={(e) => props.onChange({ format: e.target.value as OddsFormat })} aria-label={`${label} format`}>
          {ODDS_FORMATS.map((f) => (
            <option key={f} value={f}>
              {ODDS_FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
        <button className="btn justify-center px-0 text-zinc-500" onClick={props.onRemove} aria-label={props.removeLabel ?? `Remove ${label.toLowerCase()}`} title={props.removeTitle ?? 'Remove'}>
          ×
        </button>
      </div>
      {typed && (!p || !p.plain) && (
        <p className={`mt-0.5 pl-1 text-xs ${p ? 'text-zinc-400' : 'text-red-400'}`} data-testid="odds-converted">
          {p ? (
            <>
              = {formatOdds(p.decimal)} decimal · {p.label}
            </>
          ) : (
            'Cannot read these odds'
          )}
        </p>
      )}
    </div>
  );
}

/** A combination split's total odds: the product of its legs until the book's real price is typed over it. */
function TotalOdds({ row, n, estimate, estimated, onChange }: { row: SplitText; n: number; estimate: number | null; estimated: boolean; onChange(total: string | undefined): void }) {
  const est = estimate == null ? '' : formatOdds(estimate);
  const typed = (row.total ?? '').trim();
  const p = typed ? parseOdds(typed, 'auto') : null;
  return (
    <span className="ml-auto flex items-center gap-2">
      <span className="text-zinc-400">Total odds</span>
      <input
        className={`field w-24 py-0.5 tabular-nums ${typed && !p ? 'border-red-500' : ''}`}
        value={row.total ?? est}
        placeholder={est || 'total'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Selection ${n + 1} total odds`}
        aria-invalid={!!typed && !p}
      />
      {estimated ? (
        <span className="text-amber-300" data-testid="total-estimated" title="The legs' odds multiplied. Type the book's real price for the combination over it.">
          {estimate == null ? 'needs every leg’s odds, or type the total' : 'estimated'}
        </span>
      ) : (
        <>
          {p && !p.plain && <span className="text-zinc-400">= {formatOdds(p.decimal)}</span>}
          {typed && !p && <span className="text-red-400">Cannot read these odds</span>}
          <button className="text-zinc-500 hover:text-white" onClick={() => onChange(undefined)} title="Back to the estimate (legs multiplied)" aria-label={`Selection ${n + 1} use estimated total`}>
            ↺
          </button>
        </>
      )}
    </span>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{text}</span>
      {children}
    </label>
  );
}

function Tile({ label, sub, testId, children }: { label: string; sub?: string; testId: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4" data-testid={testId}>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums" data-testid={`${testId}-value`}>
        {children}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
