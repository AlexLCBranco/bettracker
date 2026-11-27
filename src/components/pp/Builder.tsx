'use client';

// BT-31: the PP builder, in four steps: 1 pool (the leg list in edit mode), 2 scheme with a proposal and a live
// preview, 3 generate (semi-random, seeded), 4 place (a checklist: Space ticks and moves down).

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { BalanceHint } from '@/components/Bankroll';
import { OddsInput } from '@/components/OddsInput';
import { formatMoney, formatOdds, oddsFromText, parseNumber, profitMoney } from '@/lib/money';
import { ppId, ticketView, type BatchInput, type PPBatch } from '@/lib/pp';
import { generate, mmGroups, placeLine, preview, propose, roles, startingScheme, type PPScheme } from '@/lib/ppBuilder';

const ROLE_TEXT = { every: 'on every PP', share: 'a share of the PPs', fixed: 'a fixed number of PPs each' } as const;

export function Builder({ batch, save, editPool }: { batch: PPBatch; save(p: Partial<BatchInput>): unknown; editPool(): void }) {
  const { batches, notify } = useApp();
  // the last batch's scheme is the starting point for this one
  const previous = useMemo(() => batches.filter((b) => b.id !== batch.id && b.scheme).sort((a, b) => (a.placedDate === b.placedDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.placedDate < b.placedDate ? 1 : -1))[0], [batches, batch.id]);
  const [s, setS] = useState<PPScheme>(() => startingScheme(batch, previous?.scheme ?? null));
  const set = <K extends keyof PPScheme>(k: K, v: PPScheme[K]) => setS((x) => ({ ...x, [k]: v }));
  const r = roles(batch.tiers);
  const levelNames = batch.tiers.filter((t) => r.get(t.id)?.role === 'share').map((t) => t.name);
  const proposal = useMemo(() => propose(batch, s), [batch, s]);
  const gen = useMemo(() => generate(batch, s), [batch, s]);
  const pv = useMemo(() => preview(batch, s, gen), [batch, s, gen]);
  const legName = new Map(batch.legs.map((l) => [l.id, l.selection]));
  const turns = mmGroups(batch.legs, batch.tiers).filter((g) => g.length > 1);

  const commit = () => {
    const settled = batch.legs.some((l) => l.result !== 'pending');
    if (batch.tickets.length && !window.confirm(`Replace the ${batch.tickets.length} PPs of this batch with ${gen.tickets.length} new ones?${settled ? ' Some legs are already settled.' : ''}`)) return;
    void save({ tickets: gen.tickets.map((t) => ({ ...t, id: ppId('pp') })), scheme: { ...s } as unknown as Record<string, unknown> });
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
          <Num label="Band from" value={s.bandMin} onChange={(v) => set('bandMin', v)} />
          <Num label="Band to" value={s.bandMax} onChange={(v) => set('bandMax', v)} />
          {levelNames.map((name, i) => (
            <Num key={name + i} label={`${name}: % of PPs`} value={s.majorShares[i] ?? 0} onChange={(v) => set('majorShares', s.majorShares.map((x, j) => (j === i ? Math.min(100, Math.max(0, v)) : x)))} />
          ))}
          {r.size >= 3 && <Num label={`${batch.tiers.at(-1)!.name}: PPs each`} value={s.shotCount} onChange={(v) => set('shotCount', Math.max(0, Math.round(v)))} />}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={s.avoidPairs} onChange={(e) => set('avoidPairs', e.target.checked)} />
            Avoid repeating the same pair of legs
          </label>
        </div>
        <div className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${proposal.short ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'}`} data-testid="proposal">
          <span className="font-semibold">Proposal:</span> <span>{proposal.message}</span>
          {!proposal.short && batch.legs.length > 0 && (
            <button className="btn ml-auto text-xs" onClick={() => setS(proposal.scheme)}>
              Use proposal
            </button>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">No numbers are fixed: Majors 50% and PP shots on 2 PPs each are only where it starts. The last batch&apos;s scheme is where the next one starts.</p>
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
          <button className="btn btn-primary text-sm" disabled={!gen.tickets.length} onClick={commit}>
            Generate {gen.tickets.length} PPs
          </button>
          {gen.dropped > 0 && <span className="text-xs text-amber-300">{gen.dropped} could not be made different from the others (no two identical PPs).</span>}
        </div>
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
        <dt className="text-zinc-500">Outside {s.bandMin}–{s.bandMax}</dt>
        <dd className={`tabular-nums ${pv.outside ? 'text-amber-300' : 'text-zinc-200'}`} data-testid="pv-outside">
          {pv.outside} PPs
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
  const setTicket = (id: string, patch: { placed?: boolean; oddsOverride?: number | null }) => void save({ tickets: batch.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
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
              <OddsCell key={`${t.id}-${t.oddsOverride}`} value={t.oddsOverride} onSave={(o) => setTicket(t.id, { oddsOverride: o })} label={`PP ${t.number} book odds`} />
            </div>
          );
        })}
      </div>
    </div>
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

function Num({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  // a new value from outside (Use proposal) replaces the text
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
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
