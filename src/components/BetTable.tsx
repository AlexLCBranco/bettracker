'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, formatDayHeader, formatDayMonth, parseDateInput } from '@/lib/dates';
import { betLabel, duplicateDutchDraft, dutchSummary, editDutchDraft, type GroupOutcome } from '@/lib/dutch';
import { duplicateForm } from '@/lib/form';
import { formatMoney, formatOdds, MONEY_SYMBOL, oddsFromText, parseNumber, profit, type MoneyScope } from '@/lib/money';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result } from '@/lib/types';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { OddsInput } from './OddsInput';
import { comboHits, dutchHits, missesTitle } from '@/lib/hits';
import { tidyText, type NameCasing } from '@/lib/tidy';
import { settleDutchRow, undoLast, type DutchRowAction, type SettleChange, type SettleState } from '@/lib/settle';
import { DutchSettleButtons } from './DutchSettle';
import { isTyping } from './Shell';
import { betTone, groupTone, resultTone } from '@/lib/tone';
import { TONE_BADGE, TONE_EDGE, TONE_TEXT } from './tone';
import { betResultLine, betsText, displayGame, dutchResultLine, legGames, legMarkets, tableDays } from '@/lib/table';

const QUICK_RESULTS: { r: Result; key: string; cls: string }[] = [
  { r: 'won', key: 'W', cls: 'hover:bg-emerald-600/40 text-emerald-400' },
  { r: 'lost', key: 'L', cls: 'hover:bg-red-600/40 text-red-400' },
  { r: 'void', key: 'V', cls: 'hover:bg-zinc-600/40 text-zinc-300' },
];

/** BT-18: one size and weight on every row (bet, combination, dutch). */
export function ProfitText({ value, pending, money = 'real' }: { value: number; pending?: boolean; money?: MoneyScope }) {
  if (pending) return <span className="text-zinc-500">-</span>;
  return <span className={`font-semibold ${value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{formatMoney(value, money, true)}</span>;
}

/** BT-23: no row tint; the left edge, the result pill and the coloured +/- are the row's only win/loss signals. */
const ROW = 'group h-11 border-b border-zinc-900 hover:bg-zinc-900/60';
const COLS = 10;
/** Second line of a cell (sport, game date, result detail). */
const SUB = 'text-[11px] leading-tight text-zinc-500';
/** Hypothetical money (H$): violet, so it never reads as real money (BT-14). */
const HYPO = 'text-violet-300';
const HYPO_TITLE = 'Hypothetical dollars: not real money, never counted with R$';
/** The actions column: pinned to the right edge with the card's background. */
const STICKY = 'sticky right-0 z-[1] bg-zinc-950';
/** ✎ and ⋯: shown on row hover and keyboard focus only (W / L / V and the dutch settle buttons always show). */
const HOVER_ONLY = 'inline-flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100';
const NUM = 'whitespace-nowrap px-1.5 text-right tabular-nums';
const CELL = 'px-1.5 py-1 align-middle';

/** "Combo ×2", "Dutch ×3", "Solo". */
const typeText = (kind: 'solo' | 'combination' | 'dutch', n: number) => (kind === 'solo' ? 'Solo' : `${kind === 'dutch' ? 'Dutch' : 'Combo'} ×${n}`);

function LiveTag() {
  return (
    <span className="ml-1 rounded bg-red-500/15 px-1 py-px text-[10px] font-bold tracking-wide text-red-400" data-testid="live-tag">
      LIVE
    </span>
  );
}

/** ▸ that turns to point down when open; at least a 24px hit area. */
function Chevron({ expanded, noun, onClick }: { expanded: boolean; noun: string; onClick(): void }) {
  return (
    <button className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label={`${expanded ? 'Hide' : 'Show'} ${noun}`} aria-expanded={expanded} onClick={onClick} data-testid="chevron">
      <span aria-hidden className={`inline-block text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
        ▸
      </span>
    </button>
  );
}

/** The vertical line joining a split or leg row to the row it belongs to. */
function Connector({ last }: { last: boolean }) {
  return (
    <>
      <span aria-hidden data-testid="connector" className={`absolute left-[18px] top-0 border-l border-zinc-700 ${last ? 'h-1/2' : 'h-full'}`} />
      <span aria-hidden className="absolute left-[18px] top-1/2 w-2.5 border-t border-zinc-700" />
    </>
  );
}

/** The Game cell of a dutch or a combination: its first game with a "+1" chip for the others, "no game" when none. */
function GamesText({ legs, names }: { legs: Leg[]; names: NameCasing }) {
  const games = legGames(legs, names);
  if (!games.length) return <span className="text-zinc-600">no game</span>;
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="combo-games">
      <span className="truncate" title={games.join(', ')}>
        {games[0]}
      </span>
      {games.length > 1 && (
        <span className="shrink-0 rounded bg-zinc-800 px-1 text-[10px] font-semibold text-zinc-300" title={games.join(', ')} data-testid="several-games">
          +{games.length - 1}
        </span>
      )}
    </span>
  );
}

/** The muted line under Game: sport, "2 markets" when they differ, "game 23 Nov" when the game is on another day. */
function GameSub({ sport, markets, gameDate }: { sport?: ReactNode; markets?: string[]; gameDate?: ReactNode }) {
  const parts = [sport, markets && markets.length > 1 ? (
    <span key="m" title={markets.join(', ')} className="underline decoration-dotted underline-offset-2" data-testid="several-markets">
      {markets.length} markets
    </span>
  ) : null, gameDate].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className={`${SUB} flex min-w-0 items-center gap-1 truncate`}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-zinc-700">·</span>}
          {p}
        </Fragment>
      ))}
    </div>
  );
}

/** Splits' fields hidden when they equal the dutch's (BT-23). */
interface Parent {
  book: string;
  type: string;
  situation: string;
}

/**
 * Bets as table rows under a header per day, each cell editable inline. A dutch is one row (total stake, combined
 * odds, net profit) that expands to its bets. `limit` caps the rows shown (a dutch counts as one row).
 */
export function BetTable({ bets, limit, empty = 'No bets yet. Type one in the quick-add line above.' }: { bets: Bet[]; limit?: number; empty?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rowSettle = useDutchRowSettle();
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!bets.length) return <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>;
  const days = tableDays(bets, limit);
  const th = 'sticky top-0 z-[2] bg-zinc-950 px-1.5 py-2 text-[11px] font-medium text-zinc-500 shadow-[inset_0_-1px_0_rgb(39_39_42)]';

  return (
    // BT-23: fixed widths for the numbers, the text columns take the rest (no sideways scroll at 1366px); clip, not
    // scroll, so the header row can stick to the top of the page
    <div className="overflow-x-clip" data-testid="bet-table-scroll">
      <table className="w-full table-fixed text-sm" data-testid="bet-table">
        <colgroup>
          <col className="w-9" />
          <col />
          <col />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-16" />
          <col className="w-[84px]" />
          <col className="w-[108px]" />
          <col className="w-32" />
          <col className="w-[288px]" />
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className={th} />
            <th className={th}>Game</th>
            <th className={th}>Bet</th>
            <th className={th}>Book</th>
            <th className={`${th} text-right`}>Stake</th>
            <th className={`${th} text-right`}>Odds</th>
            <th className={th}>Type</th>
            <th className={`${th} text-right`}>+/-</th>
            <th className={th}>Result</th>
            <th className={`${th} right-0 z-[3] text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <Fragment key={`${d.date}-${d.rows[0]!.kind === 'bet' ? d.rows[0]!.bet.id : d.rows[0]!.dutchId}`}>
              <tr className="border-b border-zinc-800 bg-zinc-900/70" data-testid="day-header" data-date={d.date}>
                <td colSpan={COLS} className="px-2 py-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200" data-testid="day-label">
                      {formatDayHeader(d.date)}
                    </span>
                    <span className="tabular-nums text-zinc-400" data-testid="day-totals">
                      {betsText(d.count)}
                      {d.nets.map((n) => (
                        <Fragment key={n.money}>
                          {' · '}
                          <span className={`font-semibold ${n.money === 'hypothetical' ? HYPO : n.value > 0 ? 'text-emerald-400' : n.value < 0 ? 'text-red-400' : 'text-zinc-400'}`} data-testid={`day-net-${n.money}`}>
                            {formatMoney(n.value, n.money, true)}
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  </div>
                </td>
              </tr>
              {d.rows.map((r) => {
                if (r.kind === 'bet') return <BetRow key={r.bet.id} b={r.bet} expanded={open.has(r.bet.id)} toggle={() => toggle(r.bet.id)} />;
                const expanded = open.has(r.dutchId);
                const parent: Parent = { book: shared(r.bets, (b) => b.book), type: shared(r.bets, (b) => b.type), situation: shared(r.bets, (b) => b.situation) };
                return (
                  <Fragment key={r.dutchId}>
                    <DutchRow bets={r.bets} dutchId={r.dutchId} expanded={expanded} toggle={() => toggle(r.dutchId)} settle={rowSettle} />
                    {expanded && r.bets.map((b, i) => <BetRow key={b.id} b={b} expanded={open.has(b.id)} toggle={() => toggle(b.id)} split={{ index: i, last: i === r.bets.length - 1 && !open.has(b.id), parent }} />)}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const OUTCOME_LABEL: Record<GroupOutcome, string> = { pending: 'Pending', won: 'Won', lost: 'Lost', even: 'Even' };

/** The dutch's bets' shared value for a field, "Mixed" when they differ, "" when none is set. */
function shared(bets: Bet[], pick: (b: Bet) => string) {
  const vals = [...new Set(bets.map(pick).filter(Boolean))];
  return vals.length === 1 ? vals[0]! : vals.length > 1 ? 'Mixed' : '';
}

const ACTION_LABEL = (a: DutchRowAction, bets: Bet[]) =>
  a === 'none' ? 'None won' : a === 'all' ? 'All won' : a === 'void' ? 'Void' : a === 'shared' ? 'Shared leg lost' : a.length ? `Won: ${a.map((i) => betLabel(bets.filter((b) => b.result === 'pending')[i]!)).join(', ')}` : 'None won';

type RowSettle = ReturnType<typeof useDutchRowSettle>;

/**
 * The dutch row buttons' settle and undo (BT-10): the Settle page's functions, one undo step. "Undo" shows on the
 * settled row for 8 s; Z on the page undoes the last one (while not typing and no form is open).
 */
function useDutchRowSettle() {
  const { update, notify, form, dutchForm } = useApp();
  const [last, setLast] = useState<{ dutchId: string; state: SettleState } | null>(null);
  const [undoShown, setUndoShown] = useState<string | null>(null);
  useEffect(() => {
    if (!undoShown) return;
    const t = setTimeout(() => setUndoShown(null), 8000);
    return () => clearTimeout(t);
  }, [undoShown, last]);
  const apply = (changes: SettleChange[]) => {
    for (const c of changes) void update(c.id, { result: c.result, cashout: c.cashout, ...(c.legs ? { legs: c.legs } : {}) }).catch(() => undefined);
  };
  const settle = (dutchId: string, bets: Bet[], action: DutchRowAction) => {
    const step = settleDutchRow(dutchId, bets, action);
    if (!step) return;
    apply(step.changes);
    setLast({ dutchId, state: step.state });
    setUndoShown(dutchId);
    notify(`${ACTION_LABEL(action, bets)} · dutch (${bets.length} bets)`);
  };
  const undo = () => {
    const u = last && undoLast(last.state);
    if (!u) return;
    apply(u.changes);
    setLast(null);
    setUndoShown(null);
    notify('Undone');
  };
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (form || dutchForm || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'z' || !last) return;
      e.preventDefault();
      undo();
    };
  });
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return { settle, undo, undoShown };
}

/** The result pill's one muted line (BT-23). */
function ResultLine({ text, lost }: { text: string | null; lost?: boolean }) {
  if (!text) return null;
  return (
    <div className={`mt-0.5 truncate text-[11px] leading-tight ${lost ? 'text-red-400/80' : 'text-zinc-500'}`} title={text} data-testid="result-sub">
      {text}
    </div>
  );
}

function DutchRow({ bets, dutchId, expanded, toggle, settle }: { bets: Bet[]; dutchId: string; expanded: boolean; toggle(): void; settle: RowSettle }) {
  const { removeDutch, openDutch, names: nameCasing } = useApp();
  const s = dutchSummary(bets);
  const tone = groupTone(s.outcome);
  const money = bets[0]!.money;
  const names = bets.map((b) => tidyText(betLabel(b), nameCasing)).join(' / ');
  const books = [...new Set(bets.map((b) => b.book).filter(Boolean))].join(', ');
  const placed = bets.map((b) => b.placedDate).sort()[0]!;
  const game = bets.map((b) => b.gameDate).sort()[0]!;
  const legs = bets.flatMap((b) => b.legs);
  const sport = shared(bets, (b) => b.legs[0]?.sport ?? '');
  return (
    <tr className={ROW} data-testid="dutch-row" data-dutch-id={dutchId} data-tone={tone} data-money={money}>
      <td className={`px-1 ${TONE_EDGE[tone]}`}>
        <Chevron expanded={expanded} noun="bets" onClick={toggle} />
      </td>
      <td className={`${CELL} text-zinc-200`}>
        <GamesText legs={legs} names={nameCasing} />
        <GameSub
          sport={sport || undefined}
          markets={legMarkets(legs)}
          gameDate={
            placed !== game ? (
              <span data-testid="game-date">game {formatDayMonth(game)}</span>
            ) : undefined
          }
        />
      </td>
      <td className={`${CELL} font-semibold text-zinc-100`}>
        <div className="truncate" title={names}>
          {names}
        </div>
      </td>
      <td className={`${CELL} text-zinc-400`}>
        <div className="truncate" title={books}>
          {books}
        </div>
      </td>
      <td className={NUM} data-testid="dutch-stake">
        <span className={money === 'hypothetical' ? HYPO : 'text-zinc-200'}>{formatMoney(s.stake, money)}</span>
      </td>
      <td className={`${NUM} text-zinc-200`} data-testid="dutch-odds" title="Combined odds: 1 / Σ(1/odds)">
        {formatOdds(s.combinedOdds, 2)}
      </td>
      <td className={`${CELL} whitespace-nowrap text-zinc-300`} data-testid="type">
        {typeText('dutch', bets.length)}
        {shared(bets, (b) => b.situation) === 'live' && <LiveTag />}
      </td>
      <td className={NUM} data-testid="profit">
        <ProfitText value={s.profit} pending={s.outcome === 'pending'} money={money} />
      </td>
      <td className={CELL}>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`} title={missesTitle(dutchHits(bets))} data-testid="result">
          {OUTCOME_LABEL[s.outcome]}
        </span>
        <ResultLine text={dutchResultLine(bets)} />
      </td>
      <td className={`${STICKY} whitespace-nowrap px-1.5 text-right`}>
        <span className="inline-flex items-center gap-0.5">
          {settle.undoShown === dutchId ? (
            <button className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30" title="Undo the settle (Z)" onClick={settle.undo}>
              Undo
            </button>
          ) : (
            <DutchSettleButtons dutchId={dutchId} bets={bets} onSettle={(a) => settle.settle(dutchId, bets, a)} />
          )}
          <span className={HOVER_ONLY} data-testid="row-actions">
            <IconButton label="Edit dutch" onClick={() => openDutch(editDutchDraft(bets), undefined, { dutchId, bets })}>
              ✎
            </IconButton>
            <RowMenu
              label="More dutch actions"
              items={[
                { label: 'Duplicate dutch', icon: '⧉', onClick: () => openDutch(duplicateDutchDraft(bets)) },
                {
                  label: 'Delete dutch',
                  icon: '🗑',
                  danger: true,
                  onClick: () => {
                    if (window.confirm(`Delete this dutch and its ${bets.length} bets (${formatMoney(s.stake, money)} in all: ${names})? This cannot be undone.`)) void removeDutch(dutchId);
                  },
                },
              ]}
            />
          </span>
        </span>
      </td>
    </tr>
  );
}

function BetRow({ b, expanded, toggle, split }: { b: Bet; expanded: boolean; toggle(): void; split?: { index: number; last: boolean; parent: Parent } }) {
  const { update, remove, openEdit, openNew, names } = useApp();
  const save = (patch: Partial<BetInput>) => update(b.id, patch).catch(() => undefined);
  const saveLeg = (i: number, patch: Partial<Leg>) => save({ legs: b.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const settle = (r: Result) => {
    if (r === 'cash-out') {
      const a = window.prompt(`Cash-out amount returned (${MONEY_SYMBOL[b.money]}):`);
      const amount = a == null ? null : parseNumber(a);
      if (amount == null) return;
      void save({ result: r, cashout: amount });
    } else void save({ result: r, cashout: null });
  };

  const nested = !!split;
  const solo = b.type === 'solo';
  const tone = betTone(b);
  // a dutch's bets are logged without bet text: show the selection instead
  const rawDisplay = b.betText || (nested ? b.legs[0]?.selection : undefined);
  const betDisplay = rawDisplay && tidyText(rawDisplay, names);
  const combo = b.type === 'combination';
  const hits = comboHits(b);
  const line = betResultLine(b);
  const gameDiffers = b.placedDate !== b.gameDate;
  const hideBook = nested && split.parent.book === b.book;
  const hideType = nested && split.parent.type === b.type;
  const showLive = b.situation === 'live' && !(nested && split.parent.situation === 'live');
  // BT-17: switching a bet with one leg (or none) to Combo opens the form, where its legs are added
  const setType = (v: string) => {
    if (v === 'combination' && b.legs.filter((l) => l.selection || l.game).length < 2) openEdit({ ...b, type: 'combination', legs: b.legs.filter((l) => l.selection || l.game || l.market) });
    else void save({ type: v as Bet['type'] });
  };
  const gameDateCell = gameDiffers ? (
    <span data-testid="game-date" className="inline-flex">
      <Cell bare inline kind="date" value={formatDate(b.gameDate)} display={`game ${formatDayMonth(b.gameDate)}`} label="Game date" onSave={(v) => save({ gameDate: parseDateInput(v) ?? b.gameDate })} />
    </span>
  ) : undefined;
  const text = nested ? 'text-xs' : '';
  return (
    <>
      <tr className={`${ROW} ${text}`} data-testid="bet-row" data-bet-id={b.id} data-nested={nested || undefined} data-tone={tone} data-money={b.money}>
        <td className={`relative px-1 ${TONE_EDGE[tone]}`}>
          {nested && <Connector last={split.last} />}
          {combo && (
            <span className={nested ? 'relative ml-4 inline-flex' : 'inline-flex'}>
              <Chevron expanded={expanded} noun="legs" onClick={toggle} />
            </span>
          )}
        </td>
        <td className={`${CELL} ${nested ? 'pl-3' : ''}`}>
          {solo ? (
            <Cell bare truncate="max-w-full" kind="text" field="game" sport={b.legs[0]?.sport} value={b.legs[0]?.game ?? ''} display={displayGame(b.legs[0]?.game ?? '', names)} empty="no game" label="Game" onSave={(v) => saveLeg(0, { game: v })} />
          ) : (
            <div className="text-zinc-300" title={b.legs.length ? undefined : 'No legs entered: ✎ Edit to add them'}>
              <GamesText legs={b.legs} names={names} />
            </div>
          )}
          <GameSub
            sport={
              solo ? (
                b.legs[0]?.sport ? <Cell bare inline kind="text" field="sport" value={b.legs[0]?.sport ?? ''} label="Sport" onSave={(v) => saveLeg(0, { sport: v })} /> : undefined
              ) : (
                [...new Set(b.legs.map((l) => l.sport).filter(Boolean))].join(', ') || undefined
              )
            }
            markets={combo ? legMarkets(b.legs) : undefined}
            gameDate={gameDateCell}
          />
        </td>
        <td className={`${CELL} ${nested ? 'pl-3' : ''}`}>
          <div className="flex min-w-0 items-center gap-1.5">
            {nested && (
              <span className="shrink-0 text-[11px] text-zinc-500" data-testid="split-label">
                Split {split.index + 1}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <Cell bare truncate="max-w-full" kind="text" field="betText" value={b.betText} display={betDisplay} label="Bet" onSave={(v) => save({ betText: v })} />
            </span>
          </div>
        </td>
        {hideBook ? <td data-testid="book-hidden" /> : <Cell kind="text" truncate="max-w-full" field="book" value={b.book} extraClass="text-zinc-400" label="Book" onSave={(v) => save({ book: v })} />}
        <Cell kind="number" value={String(b.stake)} display={formatMoney(b.stake, b.money)} extraClass={b.money === 'hypothetical' ? HYPO : undefined} title={b.money === 'hypothetical' ? HYPO_TITLE : undefined} label="Stake" onSave={(v) => save({ stake: parseNumber(v) ?? b.stake })} right />
        <Cell kind="odds" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save({ odds: oddsFromText(v) ?? b.odds })} right />
        <td className={`${CELL} whitespace-nowrap`} data-testid="type">
          {!hideType && (
            <span className="inline-flex">
              <Cell bare inline kind="select" options={['solo', 'combination']} labels={{ solo: 'Solo', combination: 'Combo' }} display={combo ? typeText('combination', b.legs.length) : 'Solo'} extraClass="text-zinc-300" value={b.type} label="Type" onSave={setType} />
            </span>
          )}
          {showLive && <LiveTag />}
        </td>
        <td className={NUM} data-testid="profit">
          <ProfitText value={profit(b)} pending={b.result === 'pending'} money={b.money} />
        </td>
        <td className={CELL}>
          <ResultCell bet={b} title={hits ? missesTitle(hits) : undefined} onPick={(r) => settle(r)} />
          <ResultLine text={line} lost={b.result === 'lost' || b.result === 'half-lost'} />
        </td>
        <td className={`${STICKY} whitespace-nowrap px-1.5 text-right`}>
          <span className="inline-flex items-center gap-0.5">
            {/* BT-18 / BT-23: W / L / V always on unsettled bets (a settled one changes from its result pill) */}
            {b.result === 'pending' &&
              QUICK_RESULTS.map(({ r, key, cls }) => (
                <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`} title={RESULT_LABEL[r]} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle(r)}>
                  {key}
                </button>
              ))}
            <span className={HOVER_ONLY} data-testid="row-actions">
              <IconButton label="Edit" onClick={() => openEdit(b)}>
                ✎
              </IconButton>
              <RowMenu
                label="More actions"
                items={[
                  { label: 'Duplicate', icon: '⧉', onClick: () => openNew(duplicateForm(b)) },
                  {
                    label: 'Delete',
                    icon: '🗑',
                    danger: true,
                    onClick: () => {
                      if (window.confirm(`Delete this bet (${formatMoney(b.stake, b.money)} @${formatOdds(b.odds)} ${betDisplay ?? ''})? This cannot be undone.`)) void remove(b.id);
                    },
                  },
                ]}
              />
            </span>
          </span>
        </td>
      </tr>
      {expanded && combo && b.legs.length === 0 && (
        <tr className="border-b border-zinc-900 text-xs" data-testid="no-legs">
          <td />
          <td colSpan={COLS - 2} className="px-1.5 py-1.5 text-zinc-500">
            No legs entered.{' '}
            <button className="text-emerald-400 hover:underline" onClick={() => openEdit(b)}>
              ✎ Add legs
            </button>
          </td>
          <td className={STICKY} />
        </tr>
      )}
      {expanded &&
        b.legs.map((l, i) => {
          const lt = resultTone(l.result);
          const legLost = l.result === 'lost' || l.result === 'half-lost';
          return (
            <tr key={l.id} className={`${ROW} text-xs`} data-testid="leg-row" data-lost={legLost || undefined} data-tone={lt}>
              <td className={`relative px-1 ${TONE_EDGE[lt]}`}>
                <Connector last={i === b.legs.length - 1 && (!nested || split.last)} />
              </td>
              <td className={`${CELL} pl-3`}>
                <Cell bare truncate="max-w-full" kind="text" field="game" sport={l.sport} value={l.game} display={displayGame(l.game, names)} empty="no game" label={`Leg ${i + 1} game`} onSave={(v) => saveLeg(i, { game: v })} />
                <div className={SUB}>
                  <Cell bare truncate="max-w-full" kind="text" field="sport" value={l.sport} label={`Leg ${i + 1} sport`} onSave={(v) => saveLeg(i, { sport: v })} />
                </div>
              </td>
              <td className={`${CELL} pl-3`}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[11px] text-zinc-500">Leg {i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <Cell bare truncate="max-w-full" kind="text" field="selection" sport={l.sport} value={l.selection} display={tidyText(l.selection, names)} label={`Leg ${i + 1} selection`} onSave={(v) => saveLeg(i, { selection: v })} />
                  </span>
                </div>
              </td>
              <Cell kind="text" truncate="max-w-full" field="market" sport={l.sport} value={l.market} extraClass="text-zinc-400" label={`Leg ${i + 1} market`} onSave={(v) => saveLeg(i, { market: v })} />
              <td />
              <Cell kind="odds" value={formatOdds(l.odds)} label={`Leg ${i + 1} odds`} onSave={(v) => saveLeg(i, { odds: v.trim() ? (oddsFromText(v) ?? l.odds) : null })} right />
              <td colSpan={2} />
              <Cell kind="select" options={[...RESULTS]} labels={RESULT_LABEL} value={l.result} extraClass={`font-medium ${TONE_TEXT[lt]}`} label={`Leg ${i + 1} result`} onSave={(v) => saveLeg(i, { result: v as Result })} />
              <td className={STICKY} />
            </tr>
          );
        })}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white" title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ResultCell({ bet, onPick, title }: { bet: Bet; onPick(r: Result): void; title?: string }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <select
        autoFocus
        className="field py-0.5 text-xs"
        aria-label="Result"
        defaultValue={bet.result}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        onChange={(e) => {
          setEditing(false);
          onPick(e.target.value as Result);
        }}
      >
        {RESULTS.map((r) => (
          <option key={r} value={r}>
            {RESULT_LABEL[r]}
          </option>
        ))}
      </select>
    );
  return (
    <button className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[betTone(bet)]}`} onClick={() => setEditing(true)} title={title ? `${title} · click to change` : 'Change result'} data-testid="result">
      {RESULT_LABEL[bet.result]}
      {bet.result === 'cash-out' && bet.cashout != null ? ` ${formatMoney(bet.cashout, bet.money)}` : ''}
    </button>
  );
}

type CellProps = {
  value: string;
  label: string;
  onSave(v: string): unknown;
  display?: string;
  right?: boolean;
  /** Render without its own <td> (a second line inside a merged cell). */
  bare?: boolean;
  /** Inline-block instead of a block (several cells on one line). */
  inline?: boolean;
  /** Muted text shown when there is no value (default "-"). */
  empty?: string;
  /** Max-width class: the text is cut with "…" and shown in full on hover. */
  truncate?: string;
  /** Extra classes and tooltip on the shown value (H$ stakes, BT-14). */
  extraClass?: string;
  title?: string;
} & (
  | { kind: 'text'; field: Field; sport?: string }
  | { kind: 'number' }
  | { kind: 'odds' }
  | { kind: 'date' }
  | { kind: 'select'; options: string[]; labels?: Record<string, string> }
);

/** A table cell that turns into an input on click (or Enter when focused). Enter or blur saves, Esc cancels. */
function Cell(props: CellProps) {
  const { suggestFor } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const done = useRef(false);
  const start = () => {
    done.current = false;
    setDraft(props.value);
    setEditing(true);
  };
  const commit = () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (draft.trim() !== props.value.trim()) void props.onSave(draft.trim());
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      done.current = true;
      setEditing(false);
    }
  };
  const td = `px-1.5 py-1 ${props.right ? 'whitespace-nowrap text-right tabular-nums' : ''}`;
  const wrap = (inner: ReactNode) => (props.bare ? inner : <td className={td}>{inner}</td>);
  if (!editing) {
    const shown = props.display ?? (props.kind === 'select' ? (props.labels?.[props.value] ?? capitalize(props.value)) : props.value);
    return wrap(
      <span
        role="button"
        tabIndex={0}
        aria-label={`Edit ${props.label}`}
        title={props.title ?? (props.truncate && shown ? shown : undefined)}
        className={`-mx-1 ${props.inline ? 'inline-block' : 'block'} min-h-4 cursor-text rounded px-1 hover:bg-zinc-800 ${props.bare || props.extraClass ? '' : 'text-zinc-200'} ${props.truncate ? `${props.truncate} truncate` : ''} ${props.extraClass ?? ''}`}
        onClick={start}
        onKeyDown={(e) => e.key === 'Enter' && start()}
      >
        {shown || <span className={props.empty ? 'text-zinc-600' : 'text-zinc-700'}>{props.empty ?? '-'}</span>}
      </span>,
    );
  }
  const cls = 'field py-0.5 text-sm';
  return wrap(
    <>
      {props.kind === 'text' ? (
        <Autocomplete autoFocus className={cls} value={draft} onChange={setDraft} getSuggestions={(q) => suggestFor(props.field, q, props.sport)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      ) : props.kind === 'select' ? (
        <select
          autoFocus
          className={cls}
          value={draft}
          aria-label={props.label}
          onChange={(e) => {
            setEditing(false);
            if (e.target.value !== props.value) void props.onSave(e.target.value);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={keys}
        >
          {props.options.map((o) => (
            <option key={o} value={o}>
              {props.labels?.[o] ?? capitalize(o)}
            </option>
          ))}
        </select>
      ) : props.kind === 'odds' ? (
        <OddsInput autoFocus className={`${cls} w-24`} value={draft} onChange={setDraft} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      ) : (
        <input autoFocus className={`${cls} w-24`} value={draft} inputMode={props.kind === 'number' ? 'decimal' : undefined} placeholder={props.kind === 'date' ? 'dd/mm/yyyy' : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      )}
    </>,
  );
}

type MenuItem = { label: string; icon: string; onClick(): void; danger?: boolean };

/** "⋯": the row's less used actions (Duplicate, Delete), so the actions column stays narrow (BT-15). */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  // BT-24: drawn in a portal on <body> with a fixed position. Inside the sticky actions cell (z-index 1) the next rows'
  // sticky cells painted over it. Closes on a scroll that moves its button or a click elsewhere.
  const [at, setAt] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const open = at != null;
  const box = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const setOpen = (o: boolean | ((x: boolean) => boolean)) => {
    const next = typeof o === 'function' ? o(open) : o;
    const r = box.current?.getBoundingClientRect();
    if (!next || !r) return setAt(null);
    // opens upward when it would run past the bottom of the window
    const right = window.innerWidth - r.right;
    setAt(r.bottom + 4 + items.length * 28 + 10 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setAt(null);
    // BT-24: leaving the search box scrolls that input, which used to close the menu the moment it opened
    const close = (e: Event) => {
      const t = e.target;
      if (t === document || (t instanceof Node && t.contains(box.current))) setAt(null);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex">
      <button className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white" title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open &&
        createPortal(
          <span
          ref={menu}
          role="menu"
          style={at ?? undefined}
          className="fixed z-50 flex w-44 flex-col rounded-md border border-zinc-700 bg-zinc-900 py-1 text-left text-xs shadow-xl"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              role="menuitem"
              autoFocus={i === 0}
              aria-label={it.label}
              className={`flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-800 ${it.danger ? 'text-red-300' : 'text-zinc-200'}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <span className="w-4 text-center">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </span>,
          document.body,
        )}
    </span>
  );
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
