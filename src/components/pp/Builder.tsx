'use client';

// BT-31: the PP builder, in four steps: 1 pool (the leg list in edit mode), 2 scheme with a proposal and a live
// preview, 3 generate (semi-random, seeded), 4 place (a checklist: Space ticks and moves down).

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { BalanceHint } from '@/components/Bankroll';
import { OddsInput } from '@/components/OddsInput';
import { formatMoney, formatOdds, oddsFromText, parseNumber, profitMoney } from '@/lib/money';
import { ppId, ticketStake, ticketView, type BatchInput, type PPBatch } from '@/lib/pp';
import { effectiveScheme, generate, type Split, majorLevels, mmGroups, perLevel, placeLine, preview, propose, roles, shotPlan, startingScheme, typicalShotOdds, type PPScheme } from '@/lib/ppBuilder';

const ROLE_TEXT = { every: 'on every PP', share: 'one per PP, taking turns', fixed: 'each on the same number of PPs' } as const;

export interface BatchScheme {
  s: PPScheme;
  setS(f: (x: PPScheme) => PPScheme): void;
  /** The typical PP-shot price the planner uses; null = the pool's shots at their average (or 3.00). */
  shotOdds: number | null;
  setShotOdds(o: number | null): void;
}

/** The batch's scheme while it is being built, kept by the batch page so the Legs and Build tabs share it. */
export function useBatchScheme(batch: PPBatch | undefined): BatchScheme | null {
  const { batches } = useApp();
  const id = batch?.id;
  // the last batch's scheme is the starting point for this one
  const previous = useMemo(() => batches.filter((b) => b.id !== id && b.scheme).sort((a, b) => (a.placedDate === b.placedDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.placedDate < b.placedDate ? 1 : -1))[0], [batches, id]);
  const [own, setOwn] = useState<PPScheme | null>(null);
  const [shotOdds, setShotOdds] = useState<number | null>(null);
  if (!batch) return null;
  // a Major level added or removed since: refit the shares to the levels
  const s = !own
    ? startingScheme(batch, previous?.scheme ?? null)
    : own.majorsPerPP?.length !== majorLevels(batch.tiers)
      ? startingScheme({ tiers: batch.tiers, targetOdds: batch.targetOdds, scheme: own as unknown as Record<string, unknown> }, null)
      : own;
  return { s, setS: (f) => setOwn(f(s)), shotOdds, setShotOdds };
}

export function Builder({ batch, save, editPool, scheme }: { batch: PPBatch; save(p: Partial<BatchInput>): unknown; editPool(): void; scheme: BatchScheme }) {
  const { notify } = useApp();
  const { s } = scheme;
  const set = <K extends keyof PPScheme>(k: K, v: PPScheme[K]) => scheme.setS((x) => ({ ...x, [k]: v }));
  const r = roles(batch.tiers);
  const levelNames = batch.tiers.filter((t) => r.get(t.id)?.role === 'share').map((t) => t.name);
  // shots per PP worked out (or typed), PPs each from the pool's shots
  const eff = useMemo(() => effectiveScheme(batch, s), [batch, s]);
  const proposal = useMemo(() => propose(batch, eff), [batch, eff]);
  const gen = useMemo(() => generate(batch, eff), [batch, eff]);
  const pv = useMemo(() => preview(batch, eff, gen), [batch, eff, gen]);
  const legName = new Map(batch.legs.map((l) => [l.id, l.selection]));
  const turns = mmGroups(batch.legs, batch.tiers).filter((g) => g.length > 1);
  const pool = shotPlan(batch, s, typicalShotOdds(batch));
  const shot = batch.tiers.at(-1)?.name ?? 'PP shot';

  const commit = () => {
    const settled = batch.legs.some((l) => l.result !== 'pending');
    if (batch.tickets.length && !window.confirm(`Replace the ${batch.tickets.length} PPs of this batch with ${gen.tickets.length} new ones?${settled ? ' Some legs are already settled.' : ''}`)) return;
    // each PP its own stake: the longest gets the minimum, every PP pays about the same
    void save({ tickets: gen.tickets.map((t, i) => ({ ...t, id: ppId('pp'), stake: pv.stakes[i]! })), scheme: { ...s } as unknown as Record<string, unknown> });
    notify(`${gen.tickets.length} PPs generated: tick them as you place them`);
  };

  return (
    <div className="space-y-3" data-testid="builder">
      <Step n={1} title="Pool">
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          {batch.tiers.map((t) => (
            <span key={t.id}>
              <b>{batch.legs.filter((l) => l.tier === t.id).length}</b> {t.name} <span className="text-xs text-zinc-500">({ROLE_TEXT[r.get(t.id)!.role]})</span>
            </span>
          ))}
          <button className="btn text-xs" onClick={editPool}>
            Edit pool
          </button>
        </div>
        <ShotPlanner batch={batch} scheme={scheme} inputs={false} />
        <p className="text-xs text-zinc-400" data-testid="same-game-rule">
          Two legs from the same game are never on the same PP.
          {turns.map((g) => (
            <span key={g[0]!.id} className="block text-zinc-300" data-testid="mm-turns">
              Same game, so they take turns (one per PP): {g.map((l) => l.selection).join(' / ')}
            </span>
          ))}
        </p>
      </Step>

      <Step n={2} title="Scheme">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Num label="Number of PPs" value={s.count} onChange={(v) => set('count', Math.max(0, Math.round(v)))} />
          <Num label="Target odds" value={s.target} onChange={(v) => set('target', v)} />
          <Num label="Minimum odds" value={s.bandMin} onChange={(v) => set('bandMin', v)} />
          <Num label="Up to (flexible)" value={s.bandMax} onChange={(v) => set('bandMax', v)} />
          {levelNames.map((name, i) => (
            <Num key={name + i} label={`${name}: per PP`} value={s.majorsPerPP[i] ?? 1} onChange={(v) => set('majorsPerPP', s.majorsPerPP.map((x, j) => (j === i ? Math.max(0, Math.round(v)) : x)))} />
          ))}
          {r.size >= 3 && <ShotsPerPP batch={batch} scheme={scheme} />}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={s.avoidPairs} onChange={(e) => set('avoidPairs', e.target.checked)} />
            Avoid repeating the same pair of legs
          </label>
        </div>
        <div className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${proposal.short ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'}`} data-testid="proposal">
          <span className="font-semibold">Average PP:</span> <span>{proposal.message}</span>
        </div>
        <p className="text-[11px] text-zinc-500">The target is a guide (about it is fine); the minimum is not: no PP goes under it. One Major per PP is where it starts; the last batch&apos;s scheme is where the next one starts.</p>
        <Preview batch={batch} s={s} pv={pv} />
      </Step>

      <Step n={3} title="Generate">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">
            Seed <b className="tabular-nums text-zinc-200" data-testid="seed">{s.seed}</b>
          </span>
          <button className="btn text-xs" onClick={() => set('seed', Math.floor(Math.random() * 1e6) + 1)} title="Draw again with a new seed">
            Shuffle
          </button>
          <button className="btn btn-primary text-sm" disabled={!gen.tickets.length || gen.underMin > 0} onClick={commit}>
            Generate {gen.tickets.length} PPs
          </button>
          {gen.dropped > 0 && <span className="text-xs text-amber-300">{gen.dropped} PPs are the same as another (too few legs to make them all different).</span>}
        </div>
        {gen.notEven && (
          <p className="text-sm text-red-300" role="alert" data-testid="not-even">
            Your {pool.have} {shot}s do not split evenly over {s.count} PPs × {eff.shotsPerPP}: every {shot} must be on the same number of PPs. <SplitFix sp={pool.poolSplit} scheme={scheme} pool />
          </p>
        )}
        {gen.underMin > 0 && (
          <p className="text-sm text-red-300" role="alert" data-testid="under-min">
            {gen.underMin} PPs would be under the minimum {s.bandMin}: add longer-priced legs, a {shot} more per PP, or lower the minimum.
          </p>
        )}
        {gen.shortfalls.length > 0 && (
          <p className="text-xs text-amber-300" data-testid="shortfalls">
            Fell short: {gen.shortfalls.map((x) => `${legName.get(x.legId)} on ${x.got} of ${x.wanted}`).join(' · ')}
          </p>
        )}
        <BalanceHint money={batch.money} book={batch.book} stake={pv.totalStake} />
      </Step>

      <Step n={4} title="Place">
        <PlaceList batch={batch} save={save} />
      </Step>
    </div>
  );
}

/**
 * The PP-shot planner (owner, 2026-11-27): the average PP before shots, the shots per PP the target needs (never under
 * the minimum), the shots he plans to send and whether they split evenly (every shot on the same number of PPs), with the
 * nearest numbers that do; then the pool's shots the same way.
 */
export function ShotPlanner({ batch, scheme, inputs = true }: { batch: PPBatch; scheme: BatchScheme; inputs?: boolean }) {
  const { s } = scheme;
  const set = <K extends keyof PPScheme>(k: K, v: PPScheme[K]) => scheme.setS((x) => ({ ...x, [k]: v }));
  const odds = scheme.shotOdds ?? typicalShotOdds(batch);
  const p = shotPlan(batch, s, odds);
  if (!p.hasShotTier) return null;
  const shot = batch.tiers.at(-1)!.name;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let need: ReactNode;
  if (!p.mm && !p.majors) need = <>Add the Major-majors and Majors first: the {shot}s needed follow from them.</>;
  else if (p.perPP <= 0) need = <>That already reaches about {s.target.toFixed(2)}: no {shot}s needed.</>;
  else
    need = (
      <>
        To reach about {s.target.toFixed(2)} (never under {s.bandMin}) a PP takes{' '}
        <b className="text-zinc-100" data-testid="shots-per-pp">
          {plural(p.perPP, shot)}
        </b>{' '}
        at {odds.toFixed(2)}: the average PP is <b className="text-zinc-100">{p.average.toFixed(2)}</b>.
      </>
    );
  const ps = p.plannedSplit;
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5" data-testid="shot-planner" aria-label={`${shot}s needed`}>
      {inputs && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Num label="Number of PPs" value={s.count} onChange={(v) => set('count', Math.max(0, Math.round(v)))} />
          <Num label="Target odds" value={s.target} onChange={(v) => set('target', v)} />
          <Num label="Minimum odds" value={s.bandMin} onChange={(v) => set('bandMin', v)} />
          <ShotsPerPP batch={batch} scheme={scheme} odds={odds} />
          <PlannedShots batch={batch} scheme={scheme} odds={odds} />
          <Num label={`${shot} odds (typical)`} value={odds} onChange={(v) => scheme.setShotOdds(v > 1 ? v : null)} />
        </div>
      )}
      <p className="text-sm text-zinc-300" data-testid="shot-plan">
        {plural(p.mm, 'Major-major')} and {plural(p.majors, 'Major')}
        {p.majors ? ` (${s.majorsPerPP.map((_, k) => perLevel(s, k)).join(' / ')} per PP)` : ''}: the average PP is <b className="text-zinc-100">{p.base.toFixed(2)}</b> before any {shot}. {need}
      </p>
      {p.perPP > 0 && (
        <p className="text-sm text-zinc-300" data-testid="plan-split">
          {s.count} PPs × {p.perPP} = {ps.places} {shot} places.{' '}
          {ps.each != null ? (
            <span className="text-emerald-400" data-testid="plan-ok">
              Sending {plural(ps.shots, shot)}: each on {ps.each} PPs, every {shot} the same weight.
            </span>
          ) : (
            <span className="text-amber-300">
              {plural(ps.shots, shot)} do not split evenly ({ps.places} ÷ {ps.shots} = {(ps.places / Math.max(1, ps.shots)).toFixed(2)}). <SplitFix sp={ps} scheme={scheme} />
            </span>
          )}
        </p>
      )}
      {p.perPP > 0 && (
        <p className="text-sm text-zinc-300" data-testid="pool-split">
          {p.have === 0 ? (
            <>No {shot}s in the pool yet: find {ps.shots}.</>
          ) : p.poolSplit.each != null ? (
            <span className="text-emerald-400">
              Your {plural(p.have, shot)}: each on {p.poolSplit.each} PPs, every one the same weight.{p.have !== ps.shots ? ` (You planned ${ps.shots}.)` : ''}
            </span>
          ) : (
            <span className="text-amber-300">
              Your {plural(p.have, shot)} do not split evenly: Generate waits. {p.have < ps.shots ? `Find ${ps.shots - p.have} more for the ${ps.shots} planned, or: ` : ''}
              <SplitFix sp={p.poolSplit} scheme={scheme} pool />
            </span>
          )}
        </p>
      )}
      {inputs && scheme.shotOdds == null && (
        <p className="text-[11px] text-zinc-500">
          {shot} odds: {p.have ? `your ${p.have} at their average` : 'none in the pool yet, so 3.00'}. Type over it to plan with another price.
        </p>
      )}
    </section>
  );
}

/** The nearest numbers that split evenly: shots (fewer / more) and PPs, as buttons. In the pool, shots are found or taken out, so they are words. */
function SplitFix({ sp, scheme, pool = false }: { sp: Split; scheme: BatchScheme; pool?: boolean }) {
  const shots = (n: number, each: number) => `${n} shots (${each} PPs each)`;
  const setPlanned = (n: number) => scheme.setS((x) => ({ ...x, plannedShots: n }));
  const setCount = (n: number) => scheme.setS((x) => ({ ...x, count: n }));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="split-fix">
      {pool ? (
        <>
          {sp.fewer && <span>take {sp.shots - sp.fewer.shots} out ({shots(sp.fewer.shots, sp.fewer.each)})</span>}
          {sp.fewer && sp.more && <span>or</span>}
          {sp.more && <span>add {sp.more.shots - sp.shots} ({shots(sp.more.shots, sp.more.each)})</span>}
        </>
      ) : (
        <>
          {sp.fewer && (
            <button type="button" className="chip" onClick={() => setPlanned(sp.fewer!.shots)}>
              {shots(sp.fewer.shots, sp.fewer.each)}
            </button>
          )}
          {sp.more && (
            <button type="button" className="chip" onClick={() => setPlanned(sp.more!.shots)}>
              {shots(sp.more.shots, sp.more.each)}
            </button>
          )}
        </>
      )}
      {(sp.fewerPPs || sp.morePPs) && <span>or keep {sp.shots} with</span>}
      {sp.fewerPPs && (
        <button type="button" className="chip" onClick={() => setCount(sp.fewerPPs!.count)}>
          {sp.fewerPPs.count} PPs ({sp.fewerPPs.each} each)
        </button>
      )}
      {sp.morePPs && (
        <button type="button" className="chip" onClick={() => setCount(sp.morePPs!.count)}>
          {sp.morePPs.count} PPs ({sp.morePPs.each} each)
        </button>
      )}
    </span>
  );
}

/** "PP shots per PP": worked out from the target (Auto), or typed; Auto puts it back. One input in both modes, so typing keeps the focus. */
function ShotsPerPP({ batch, scheme, odds }: { batch: PPBatch; scheme: BatchScheme; odds?: number }) {
  const { s } = scheme;
  const shot = batch.tiers.at(-1)!.name;
  const p = shotPlan(batch, s, odds ?? scheme.shotOdds ?? typicalShotOdds(batch));
  const label = `${shot}s per PP`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <Num bare label={label} value={p.perPP} onChange={(v) => scheme.setS((x) => ({ ...x, shotsPerPPAuto: false, shotsPerPP: Math.max(0, Math.round(v)) }))} />
        {s.shotsPerPPAuto ? (
          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300" title="Worked out from the target, never leaving the average PP under the minimum. Type a number to set it yourself." data-testid="per-pp-auto">
            Auto
          </span>
        ) : (
          <button type="button" className="chip text-[10px]" onClick={() => scheme.setS((x) => ({ ...x, shotsPerPPAuto: true }))}>
            Auto
          </button>
        )}
      </div>
    </div>
  );
}

/** "PP shots you'll send": his plan, or the suggestion (the number that splits evenly with each shot on about 2 PPs). */
function PlannedShots({ batch, scheme, odds }: { batch: PPBatch; scheme: BatchScheme; odds: number }) {
  const { s } = scheme;
  const shot = batch.tiers.at(-1)!.name;
  const p = shotPlan(batch, s, odds);
  const label = `${shot}s you'll send`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <Num bare label={label} value={p.planned} onChange={(v) => scheme.setS((x) => ({ ...x, plannedShots: Math.max(0, Math.round(v)) }))} />
        {s.plannedShots == null ? (
          <span className="rounded bg-sky-500/15 px-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-300" title="Suggested: splits evenly with each shot on about 2 PPs. Type your own number." data-testid="planned-suggested">
            Suggested
          </span>
        ) : (
          <button type="button" className="chip text-[10px]" onClick={() => scheme.setS((x) => ({ ...x, plannedShots: null }))}>
            Suggest
          </button>
        )}
      </div>
    </div>
  );
}

function Preview({ batch, s, pv }: { batch: PPBatch; s: PPScheme; pv: ReturnType<typeof preview> }) {
  const f = (n: number) => n.toFixed(2);
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" data-testid="preview">
      <dl className="grid grid-cols-[9rem_1fr] content-start gap-x-3 gap-y-1 self-start text-xs">
        <dt className="text-zinc-500">Legs per PP</dt>
        <dd className="tabular-nums text-zinc-200" data-testid="pv-legs">
          {pv.legs.min} / {pv.legs.avg.toFixed(1)} / {pv.legs.max} <span className="text-zinc-500">(min / avg / max)</span>
        </dd>
        <dt className="text-zinc-500">Odds per PP</dt>
        <dd className="tabular-nums text-zinc-200" data-testid="pv-odds">
          {f(pv.odds.min)} / {f(pv.odds.avg)} / {f(pv.odds.max)} <span className="text-zinc-500">(estimated)</span>
        </dd>
        <dt className="text-zinc-500">Under the minimum {s.bandMin}</dt>
        <dd className={`tabular-nums ${pv.under ? 'text-red-300' : 'text-zinc-200'}`} data-testid="pv-under">
          {pv.under} PPs
        </dd>
        <dt className="text-zinc-500">Over {s.bandMax}</dt>
        <dd className={`tabular-nums ${pv.outside - pv.under ? 'text-amber-300' : 'text-zinc-200'}`} data-testid="pv-outside">
          {pv.outside - pv.under} PPs
        </dd>
        <dt className="text-zinc-500">Stake per PP</dt>
        <dd className="tabular-nums text-zinc-200" data-testid="pv-stakes">
          {pv.stakes.length ? `${formatMoney(Math.min(...pv.stakes), batch.money)} – ${formatMoney(Math.max(...pv.stakes), batch.money)}` : '-'} <span className="text-zinc-500">(same payout on every PP)</span>
        </dd>
        <dt className="text-zinc-500">Total stake</dt>
        <dd className="tabular-nums text-zinc-200" data-testid="pv-stake">
          {formatMoney(pv.totalStake, batch.money)}
        </dd>
        <dt className="text-zinc-500">Total potential</dt>
        <dd className="tabular-nums text-zinc-200">{formatMoney(batch.money === 'bonus' ? pv.totalPotential - pv.totalStake : pv.totalPotential, profitMoney(batch.money))}</dd>
      </dl>
      <div className="max-h-56 overflow-y-auto rounded border border-zinc-800">
        <table className="w-full text-xs" data-testid="pv-appearances">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="px-2 py-1 font-medium">Leg</th>
              <th className="px-2 py-1 text-right font-medium">Odds</th>
              <th className="px-2 py-1 text-right font-medium">PPs (wanted)</th>
            </tr>
          </thead>
          <tbody>
            {pv.appearances.map((a) => (
              <tr key={a.leg.id} className="border-t border-zinc-900">
                <td className="px-2 py-0.5 text-zinc-300 [overflow-wrap:anywhere]">{a.leg.selection}</td>
                <td className="px-2 py-0.5 text-right tabular-nums text-zinc-400">{formatOdds(a.leg.odds, 2)}</td>
                <td className={`px-2 py-0.5 text-right tabular-nums ${a.got < a.wanted ? 'text-amber-300' : 'text-zinc-200'}`}>
                  {a.got} ({a.wanted})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Step 4: the PPs in generation order, each a copy-friendly line with a "placed" tick and the book's odds. */
function PlaceList({ batch, save }: { batch: PPBatch; save(p: Partial<BatchInput>): unknown }) {
  const { notify } = useApp();
  const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const tickets = [...batch.tickets].sort((a, b) => a.number - b.number);
  const placed = tickets.filter((t) => t.placed).length;
  const setTicket = (id: string, patch: { placed?: boolean; oddsOverride?: number | null; stake?: number | null }) => void save({ tickets: batch.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox') return;
    if (e.key === ' ') {
      e.preventDefault();
      const tk = tickets[cur];
      if (!tk) return;
      setTicket(tk.id, { placed: !tk.placed });
      setCur((c) => Math.min(tickets.length - 1, c + 1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((c) => Math.max(0, Math.min(tickets.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1))));
    }
  };
  if (!tickets.length) return <p className="text-sm text-zinc-500">Generate the PPs first (or add them by hand in Tickets).</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">
        <b className="text-zinc-200" data-testid="placed-count">
          {placed} of {tickets.length}
        </b>{' '}
        placed. Click the list, then Space ticks a PP and moves down (↑ ↓ move).
      </p>
      <div ref={box} tabIndex={0} className="rounded border border-zinc-800 outline-none focus:border-emerald-600" onKeyDown={onKey} data-testid="place-list" aria-label="PPs to place">
        {tickets.map((t, i) => {
          const v = ticketView(t, batch);
          const line = placeLine(t, batch.legs, v.odds);
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 border-t border-zinc-900 px-2 py-1 text-sm first:border-t-0 ${i === cur ? 'bg-emerald-500/[0.07]' : ''}`}
              data-testid="place-row"
              data-placed={t.placed || undefined}
              data-current={i === cur || undefined}
              onClick={() => {
                setCur(i);
                box.current?.focus();
              }}
            >
              <input type="checkbox" checked={t.placed} onChange={(e) => setTicket(t.id, { placed: e.target.checked })} aria-label={`PP ${t.number} placed`} tabIndex={-1} />
              <span className={`min-w-0 flex-1 select-all [overflow-wrap:anywhere] ${t.placed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{line}</span>
              <button
                className="rounded px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard?.writeText(line).then(() => notify(`Copied PP ${t.number}`));
                }}
              >
                Copy
              </button>
              <StakeCell key={`${t.id}-s-${t.stake}`} value={ticketStake(t, batch)} money={batch.money} onSave={(x) => setTicket(t.id, { stake: x })} label={`PP ${t.number} stake`} />
              <OddsCell key={`${t.id}-${t.oddsOverride}`} value={t.oddsOverride} onSave={(o) => setTicket(t.id, { oddsOverride: o })} label={`PP ${t.number} book odds`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A PP's stake while placing: shown, and editable when the book takes another amount. */
function StakeCell({ value, money, onSave, label }: { value: number; money: PPBatch['money']; onSave(x: number): void; label: string }) {
  const [v, setV] = useState(value.toFixed(2).replace('.', ','));
  const commit = () => {
    const x = parseNumber(v);
    if (x == null || x <= 0) return setV(value.toFixed(2).replace('.', ','));
    if (x !== value) onSave(x);
  };
  return (
    <span className="flex w-24 shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()} title={`Stake (${money})`}>
      <span className="text-xs text-zinc-500">R$</span>
      <input className="field py-0.5 text-right text-xs tabular-nums" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={label} />
    </span>
  );
}

function OddsCell({ value, onSave, label }: { value: number | null; onSave(o: number | null): void; label: string }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  const commit = (text: string) => {
    const o = text.trim() ? oddsFromText(text) : null;
    if (text.trim() && o == null) return;
    if (o !== value) onSave(o);
  };
  return (
    <span className="w-24 shrink-0" onClick={(e) => e.stopPropagation()}>
      <OddsInput value={v} onChange={setV} onBlur={(_, n) => commit(n)} onKeyDown={(e) => e.key === 'Enter' && commit(v)} placeholder="book odds" aria-label={label} className="field py-0.5 text-xs" />
    </span>
  );
}

function Num({ label, value, onChange, bare }: { label: string; value: number; onChange(v: number): void; bare?: boolean }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  // a new value from outside (Use proposal) replaces the text
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  const input = (
    <input
      className="field"
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n != null) {
          setLast(n);
          onChange(n);
        }
      }}
    />
  );
  if (bare) return input;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {input}
    </label>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card space-y-2 p-3" aria-label={`Step ${n}: ${title}`}>
      <h2 className="text-sm font-semibold text-zinc-200">
        <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-800 text-xs">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
