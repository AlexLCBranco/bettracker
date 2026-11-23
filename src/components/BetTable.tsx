'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, formatDayHeader, formatDayMonth, parseDateInput } from '@/lib/dates';
import { betLabel, duplicateDutchDraft, dutchSummary, editDutchDraft, type GroupOutcome } from '@/lib/dutch';
import { duplicateForm } from '@/lib/form';
import { formatMoney, formatOdds, oddsFromText, parseNumber, potentialReturn, profit, type MoneyScope } from '@/lib/money';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result } from '@/lib/types';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { OddsInput } from './OddsInput';
import { comboHits, dutchHits, missesTitle } from '@/lib/hits';
import { tidyText } from '@/lib/tidy';
import { DutchSettleButtons } from './DutchSettle';
import { GameTarget } from './GameEditor';
import { betTone, groupTone, resultTone } from '@/lib/tone';
import { TONE_BADGE, TONE_EDGE, TONE_TEXT } from './tone';
import { betResultLine, betsText, displayGame, dutchResultLine, legGames, legMarkets, type DayGroup } from '@/lib/table';
import type { Settler } from './useSettle';
import { losingLegs, sharedLabel } from '@/lib/actuals';
import { normalize } from '@/lib/autocomplete';
import { Annotator, LabelChip, LossLine } from './Annotator';

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

/** BT-26: rows as tall as they need; the selected row (keyboard settling) is tinted. */
const ROW = 'group scroll-mt-28 border-b border-zinc-900 hover:bg-zinc-900/50 data-[selected]:bg-emerald-500/[0.07]';
const COLS = 7;
/** The muted second line of the Bet cell: one line, cut with "…" (full text on hover). */
const SUB = 'text-[11px] leading-5 text-zinc-500';
/** Bet text: bold, wraps instead of being cut (BT-26). */
const TEXT = 'font-semibold text-zinc-100 [overflow-wrap:anywhere]';
const HYPO = 'text-violet-300';
const HYPO_TITLE = 'Hypothetical dollars: not real money, never counted with R$';
/** ✎ and ⋯: on row hover, keyboard focus and the selected row (W / L / V and the dutch settle buttons always show). */
const HOVER_ONLY = 'inline-flex opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected]:opacity-100 focus-within:opacity-100';
const CELL = 'px-2 py-1.5 align-top';
const NUM = 'whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums';
const ACTIONS = 'whitespace-nowrap px-2 py-1 text-right align-top';

function LiveTag() {
  return (
    <span className="rounded bg-red-500/15 px-1 py-px text-[10px] font-bold tracking-wide text-red-400" data-testid="live-tag">
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
      <span aria-hidden data-testid="connector" className={`absolute left-[15px] top-0 border-l border-zinc-700 ${last ? 'h-4' : 'h-full'}`} />
      <span aria-hidden className="absolute left-[15px] top-4 w-2.5 border-t border-zinc-700" />
    </>
  );
}

/** One part of the muted line: the node shown, and its plain text for the line's tooltip. */
type Part = { node: ReactNode; text: string } | null | false | undefined | '';

/**
 * BT-26: the Bet cell's second line, "game · sport · market · book" plus tags and the result sub-line. One line cut
 * with "…", the full text on hover; while one of its parts is being edited it is not cut (the suggestions show).
 */
function SubLine({ parts, children }: { parts: Part[]; children?: (onEdit: (on: boolean) => void) => Part[] }) {
  const [editing, setEditing] = useState(0);
  const onEdit = (on: boolean) => setEditing((n) => Math.max(0, n + (on ? 1 : -1)));
  const all = [...parts, ...(children?.(onEdit) ?? [])].filter((p): p is { node: ReactNode; text: string } => !!p);
  if (!all.length) return null;
  return (
    <div className={`${SUB} ${editing ? '' : 'overflow-hidden text-ellipsis whitespace-nowrap'}`} title={all.map((p) => p.text).filter(Boolean).join(' · ')} data-testid="bet-sub">
      {all.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-zinc-700"> · </span>}
          {p.node}
        </Fragment>
      ))}
    </div>
  );
}

/** The game part: the first game, "+1" for the others; "+ add game" when there is none (BT-25). */
function gamePart(bets: Bet[], names: Map<string, string>): Part {
  const games = legGames(bets.flatMap((b) => b.legs), names);
  return {
    text: games.join(', '),
    node: (
      <GameTarget bets={bets} hasGame={games.length > 0} inline className="text-zinc-300">
        <span data-testid={bets.length > 1 || bets[0]!.type === 'combination' ? 'combo-games' : undefined}>
          {games[0]}
          {games.length > 1 && (
            <span className="ml-1 rounded bg-zinc-800 px-1 text-[10px] font-semibold text-zinc-300" title={games.join(', ')} data-testid="several-games">
              +{games.length - 1}
            </span>
          )}
        </span>
      </GameTarget>
    ),
  };
}

function marketsPart(markets: string[]): Part {
  if (markets.length === 0) return null;
  if (markets.length === 1) return { text: markets[0]!, node: markets[0] };
  return {
    text: markets.join(', '),
    node: (
      <span title={markets.join(', ')} className="underline decoration-dotted underline-offset-2" data-testid="several-markets">
        {markets.length} markets
      </span>
    ),
  };
}

const resultLinePart = (text: string | null): Part => (text ? { text, node: <span className="text-zinc-400" data-testid="result-sub">{text}</span> } : null);

interface TableProps {
  days: DayGroup[];
  /** The selected row's key ("bet:<id>", "dutch:<id>"). */
  selected: string | null;
  select(key: string): void;
  settle: Settler;
  /** BT-27: the row whose label / actual editor is open (T), and how to open or close it. */
  annotating: string | null;
  annotate(key: string | null): void;
  empty?: string;
}

/**
 * BT-26: bets as one full-width table under a header per day. Columns: [▸] [Bet: all leftover width] [Stake] [Odds]
 * [+/-] [Result] [actions]; the numbers are fixed narrow columns, so they line up on every row type. The Bet cell is
 * two lines: the bet text (wraps, never cut) and a muted line with game, sport, market, book and tags. A dutch is a
 * summary row with one such block per split under it. A click selects a row (keyboard settling), a double click edits.
 */
export function BetTable({ days, selected, select, settle, annotating, annotate, empty = 'No bets yet. Type one in the quick-add line above.' }: TableProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!days.length) return <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>;
  const th = 'sticky top-14 z-[2] bg-zinc-950 px-2 py-2 text-[11px] font-medium text-zinc-500 shadow-[inset_0_-1px_0_rgb(39_39_42)]';
  const row = { open, toggle, selected, select, settle, annotating, annotate };

  return (
    <div data-testid="bet-table-scroll">
      <table className="w-full table-fixed text-sm" data-testid="bet-table">
        <colgroup>
          <col className="w-8" />
          <col />
          <col className="w-[108px]" />
          <col className="w-[68px]" />
          <col className="w-[108px]" />
          <col className="w-[92px]" />
          <col className="w-[272px]" />
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className={th} />
            <th className={th}>Bet</th>
            <th className={`${th} text-right`}>Stake</th>
            <th className={`${th} text-right`}>Odds</th>
            <th className={`${th} text-right`}>+/-</th>
            <th className={th}>Result</th>
            <th className={`${th} text-right`}>
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
              {d.rows.map((r) => (r.kind === 'bet' ? <BetRow key={r.bet.id} b={r.bet} {...row} /> : <DutchGroup key={r.dutchId} dutchId={r.dutchId} bets={r.bets} {...row} />))}
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

type RowProps = { open: Set<string>; toggle(id: string): void; selected: string | null; select(key: string): void; settle: Settler; annotating: string | null; annotate(key: string | null): void };

/** BT-27: "+ label / result", faint, on row hover (T on the selected row does the same). */
function AnnotateButton({ onClick }: { onClick(): void }) {
  return (
    <button
      className="rounded px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-white"
      title="Label and actual result (T)"
      aria-label="Label and actual result"
      data-testid="annotate"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      + label / result
    </button>
  );
}

function DutchGroup({ bets, dutchId, open, toggle, selected, select, settle, annotating, annotate }: { bets: Bet[]; dutchId: string } & RowProps) {
  const { removeDutch, openDutch, names: nameCasing } = useApp();
  const s = dutchSummary(bets);
  const tone = groupTone(s.outcome);
  const money = bets[0]!.money;
  const names = bets.map((b) => tidyText(betLabel(b), nameCasing)).join(' / ');
  const books = [...new Set(bets.map((b) => b.book).filter(Boolean))];
  const placed = bets.map((b) => b.placedDate).sort()[0]!;
  const game = bets.map((b) => b.gameDate).sort()[0]!;
  const legs = bets.flatMap((b) => b.legs);
  const sport = shared(bets, (b) => b.legs[0]?.sport ?? '');
  const live = shared(bets, (b) => b.situation) === 'live';
  const key = `dutch:${dutchId}`;
  const isSel = selected === key;
  const pending = bets.filter((b) => b.result === 'pending');
  const winners = settle.winners(dutchId);
  const book = shared(bets, (b) => b.book);
  const label = sharedLabel(bets);
  const annotateHere = () => {
    select(key);
    annotate(key);
  };
  return (
    <>
      <tr className={ROW} data-testid="dutch-row" data-dutch-id={dutchId} data-key={key} data-selected={isSel || undefined} data-tone={tone} data-money={money} onClick={() => select(key)}>
        <td className={`${TONE_EDGE[tone]}`} />
        <td className={CELL}>
          <div className={`${TEXT} flex items-center gap-1.5`} data-testid="bet-text" title={names}>
            <span data-testid="type">Dutch ×{bets.length}</span>
            {label && <LabelChip label={label} />}
            {live && <LiveTag />}
          </div>
          <SubLine
            parts={[
              gamePart(bets, nameCasing),
              sport && { text: sport, node: sport },
              marketsPart(legMarkets(legs)),
              books.length > 0 && { text: books.join(', '), node: books.join(', ') },
              placed !== game && { text: `game ${formatDayMonth(game)}`, node: <span data-testid="game-date">game {formatDayMonth(game)}</span> },
              resultLinePart(dutchResultLine(bets)),
            ]}
          />
          {annotating === key && <Annotator kind="dutch" bets={bets} onClose={() => annotate(null)} />}
        </td>
        <td className={NUM} data-testid="dutch-stake" data-col="stake">
          <span className={money === 'hypothetical' ? HYPO : 'text-zinc-200'}>{formatMoney(s.stake, money)}</span>
        </td>
        <td className={`${NUM} text-zinc-200`} data-testid="dutch-odds" data-col="odds" title="Combined odds: 1 / Σ(1/odds)">
          {formatOdds(s.combinedOdds, 2)}
        </td>
        <td className={NUM} data-testid="profit" data-col="profit">
          <ProfitText value={s.profit} pending={s.outcome === 'pending'} money={money} />
        </td>
        <td className={CELL} data-col="result">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`} title={missesTitle(dutchHits(bets))} data-testid="result">
            {OUTCOME_LABEL[s.outcome]}
          </span>
        </td>
        <td className={ACTIONS}>
          <span className="inline-flex items-center gap-0.5">
            {settle.undoShown === dutchId ? (
              <button className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30" title="Undo the settle (Z)" onClick={settle.undo}>
                Undo
              </button>
            ) : (
              <DutchSettleButtons dutchId={dutchId} bets={bets} onSettle={(a) => settle.settleDutch(dutchId, bets, a)} />
            )}
            <span className={HOVER_ONLY} data-testid="row-actions">
              {!pending.length && <AnnotateButton onClick={annotateHere} />}
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
                  { label: 'Label / result', icon: '#', onClick: annotateHere },
                ]}
              />
            </span>
          </span>
        </td>
      </tr>
      {bets.map((b, i) => (
        <BetRow
          key={b.id}
          b={b}
          open={open}
          toggle={toggle}
          selected={selected}
          select={select}
          settle={settle}
          annotating={annotating}
          annotate={annotate}
          split={{
            group: bets,
            sharedLabel: label,
            index: i,
            last: i === bets.length - 1 && !open.has(b.id),
            dutchKey: key,
            book,
            live,
            pick: b.result === 'pending' ? { n: pending.indexOf(b), on: winners.includes(pending.indexOf(b)), toggle: () => settle.toggleWinner(dutchId, pending.indexOf(b)) } : null,
          }}
        />
      ))}
    </>
  );
}

interface Split {
  index: number;
  last: boolean;
  /** The dutch's key: the split is shown selected with it. */
  dutchKey: string;
  /** The dutch's shared book and situation: a split shows its own only when they differ. */
  book: string;
  live: boolean;
  /** Every bet of the dutch, and the label they all share (BT-27). */
  group: Bet[];
  sharedLabel: string;
  /** Its number key (1-9) while the dutch is pending: toggled = picked as a winner, Enter confirms. */
  pick: { n: number; on: boolean; toggle(): void } | null;
}

function BetRow({ b, open, toggle, selected, select, settle, split, annotating, annotate }: { b: Bet; split?: Split } & RowProps) {
  const { update, remove, openEdit, openNew, names } = useApp();
  const save = (patch: Partial<BetInput>) => update(b.id, patch).catch(() => undefined);
  const saveLeg = (i: number, patch: Partial<Leg>) => save({ legs: b.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const nested = !!split;
  const expanded = open.has(b.id);
  const solo = b.type === 'solo';
  const combo = b.type === 'combination';
  const tone = betTone(b);
  const key = `bet:${b.id}`;
  const isSel = selected === key || (nested && selected === split.dutchKey);
  // a dutch's bets are logged without bet text: its selection is the text, edited on the leg
  const textOnLeg = !b.betText && solo && nested;
  const rawText = b.betText || (nested ? betLabel(b) : '');
  const text = rawText && tidyText(rawText, names);
  const hits = comboHits(b);
  const leg0 = b.legs[0];
  const pending = b.result === 'pending';
  const returns = pending ? `Returns ${formatMoney(potentialReturn(b.stake, b.odds), b.money)} if it wins` : undefined;
  // BT-27: the label chip (a split shows its own only when it differs from the dutch's), a solo's actual, losing legs
  const chip = b.label && !(nested && normalize(b.label) === normalize(split.sharedLabel)) ? b.label : '';
  const soloActual = solo ? (leg0?.actual ?? '') : '';
  const losses = losingLegs(b, split?.group ?? []);
  const flow = !!(chip || soloActual);
  const annotateHere = () => {
    select(key);
    annotate(key);
  };
  const setType = (v: string) => {
    if (v === 'combination' && b.legs.filter((l) => l.selection || l.game).length < 2) openEdit({ ...b, type: 'combination', legs: b.legs.filter((l) => l.selection || l.game || l.market) });
    else void save({ type: v as Bet['type'] });
  };
  return (
    <>
      <tr className={ROW} data-testid="bet-row" data-bet-id={b.id} data-key={key} data-nested={nested || undefined} data-split-of={nested ? split.dutchKey.slice(6) : undefined} data-selected={isSel || undefined} data-tone={tone} data-money={b.money} onClick={() => select(key)}>
        <td className={`relative px-1 align-top ${TONE_EDGE[tone]}`}>
          {nested && <Connector last={split.last} />}
          {combo && (
            <span className={`${nested ? 'relative ml-3' : ''} inline-flex pt-1`}>
              <Chevron expanded={expanded} noun="legs" onClick={() => toggle(b.id)} />
            </span>
          )}
        </td>
        <td className={`${CELL} ${nested ? 'pl-5' : ''}`}>
          <div className="flex items-start gap-1.5">
            {nested &&
              (split.pick ? (
                <button
                  className={`mt-px shrink-0 rounded border px-1 text-[10px] font-semibold leading-4 ${split.pick.on ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}
                  aria-label={`Toggle won: ${text}`}
                  aria-pressed={split.pick.on}
                  title={`Split ${split.index + 1}: press ${split.pick.n + 1} (dutch selected) or click to mark it won, Enter confirms`}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(split.dutchKey);
                    split.pick!.toggle();
                  }}
                  data-testid="split-label"
                >
                  Split {split.index + 1}
                </button>
              ) : (
                <span className="mt-px shrink-0 text-[10px] leading-4 text-zinc-500" data-testid="split-label">
                  Split {split.index + 1}
                </span>
              ))}
            <div className={`min-w-0 flex-1 ${nested ? 'text-[13px]' : ''}`} data-testid="bet-text">
              {textOnLeg ? (
                <Cell bare flow={flow} kind="text" field="selection" sport={leg0?.sport} value={leg0?.selection ?? ''} display={text} label="Bet" extraClass={TEXT} onSave={(v) => saveLeg(0, { selection: v })} />
              ) : (
                <Cell bare flow={flow} kind="text" field="betText" value={b.betText} display={text} label="Bet" extraClass={TEXT} empty="(no text)" onSave={(v) => save({ betText: v })} />
              )}
              {soloActual && (
                <span className="text-zinc-400" data-testid="actual">
                  {' → '}
                  {soloActual}
                </span>
              )}
              {chip && <LabelChip label={chip} />}
            </div>
          </div>
          <SubLine
            parts={[gamePart([b], names)]}
          >
            {(onEdit) => [
              solo
                ? leg0?.sport && { text: leg0.sport, node: <Cell bare inline kind="text" field="sport" value={leg0.sport} label="Sport" onEdit={onEdit} onSave={(v) => saveLeg(0, { sport: v })} /> }
                : (() => {
                    const sports = [...new Set(b.legs.map((l) => l.sport).filter(Boolean))].join(', ');
                    return sports && { text: sports, node: sports };
                  })(),
              solo ? leg0?.market && !nested && { text: leg0.market, node: <Cell bare inline kind="text" field="market" sport={leg0.sport} value={leg0.market} label="Market" onEdit={onEdit} onSave={(v) => saveLeg(0, { market: v })} /> } : marketsPart(legMarkets(b.legs)),
              (!nested || b.book !== split.book) && { text: b.book, node: <span data-testid="book"><Cell bare inline kind="text" field="book" value={b.book} label="Book" empty="no book" onEdit={onEdit} onSave={(v) => save({ book: v })} /></span> },
              b.placedDate !== b.gameDate && {
                text: `game ${formatDayMonth(b.gameDate)}`,
                node: (
                  <span data-testid="game-date">
                    <Cell bare inline kind="date" value={formatDate(b.gameDate)} display={`game ${formatDayMonth(b.gameDate)}`} label="Game date" onEdit={onEdit} onSave={(v) => save({ gameDate: parseDateInput(v) ?? b.gameDate })} />
                  </span>
                ),
              },
              combo && {
                text: `Combo ×${b.legs.length}`,
                node: (
                  <span data-testid="type">
                    <Cell bare inline kind="select" options={['solo', 'combination']} labels={{ solo: 'Solo', combination: 'Combo' }} display={`Combo ×${b.legs.length}`} extraClass="text-zinc-300" value={b.type} label="Type" onEdit={onEdit} onSave={setType} />
                  </span>
                ),
              },
              b.situation === 'live' && !(nested && split.live) && { text: 'LIVE', node: <LiveTag /> },
              resultLinePart(betResultLine(b)),
            ]}
          </SubLine>
          {losses.length > 0 && <LossLine entries={losses} />}
          {annotating === key && <Annotator kind="bet" bet={b} group={split?.group ?? [b]} onClose={() => annotate(null)} />}
        </td>
        <Cell kind="number" testId="stake" value={String(b.stake)} display={formatMoney(b.stake, b.money)} extraClass={b.money === 'hypothetical' ? HYPO : undefined} title={[b.money === 'hypothetical' ? HYPO_TITLE : '', returns].filter(Boolean).join(' · ') || undefined} label="Stake" onSave={(v) => save({ stake: parseNumber(v) ?? b.stake })} right />
        <Cell kind="odds" testId="odds" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save({ odds: oddsFromText(v) ?? b.odds })} right />
        <td className={NUM} data-testid="profit" data-col="profit">
          <ProfitText value={profit(b)} pending={pending} money={b.money} />
        </td>
        <td className={CELL} data-col="result">
          <ResultCell bet={b} title={hits ? missesTitle(hits) : undefined} onPick={(r) => (r === 'pending' ? void save({ result: r, cashout: null }) : settle.settleBet(b, r))} />
        </td>
        <td className={ACTIONS}>
          {settle.cashoutFor === b.id ? (
            <CashoutBox bet={b} onDone={(a) => settle.settleBet(b, 'cash-out', a)} onClose={settle.cancelCashout} />
          ) : nested ? (
            <span className={HOVER_ONLY} data-testid="row-actions">
              <AnnotateButton onClick={annotateHere} />
            </span>
          ) : (
            (
              <span className="inline-flex items-center gap-0.5">
                {/* BT-18 / BT-23: W / L / V always on unsettled bets (a settled one changes from its result pill) */}
                {pending &&
                  QUICK_RESULTS.map(({ r, key: k, cls }) => (
                    <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`} title={`${RESULT_LABEL[r]} (${k})`} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle.settleBet(b, r)}>
                      {k}
                    </button>
                  ))}
                <span className={HOVER_ONLY} data-testid="row-actions">
                  <AnnotateButton onClick={annotateHere} />
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
                          if (window.confirm(`Delete this bet (${formatMoney(b.stake, b.money)} @${formatOdds(b.odds)} ${text})? This cannot be undone.`)) void remove(b.id);
                        },
                      },
                    ]}
                  />
                </span>
              </span>
            )
          )}
        </td>
      </tr>
      {expanded && combo && b.legs.length === 0 && (
        <tr className="border-b border-zinc-900 text-xs" data-testid="no-legs">
          <td />
          <td colSpan={COLS - 1} className="px-2 py-1.5 text-zinc-500">
            No legs entered.{' '}
            <button className="text-emerald-400 hover:underline" onClick={() => openEdit(b)}>
              ✎ Add legs
            </button>
          </td>
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
              <td className={`${CELL} ${nested ? 'pl-9' : 'pl-5'}`}>
                <div className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0 text-[10px] leading-4 text-zinc-500">Leg {i + 1}</span>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]" data-testid="bet-text">
                    <Cell bare flow={!!l.actual} kind="text" field="selection" sport={l.sport} value={l.selection} display={tidyText(l.selection, names)} label={`Leg ${i + 1} selection`} extraClass="text-zinc-200" onSave={(v) => saveLeg(i, { selection: v })} />
                    {l.actual && (
                      <span className="text-zinc-400" data-testid="actual">
                        {' → '}
                        {l.actual}
                      </span>
                    )}
                  </div>
                </div>
                <SubLine parts={[]}>
                  {(onEdit) => [
                    { text: displayGame(l.game, names), node: <Cell bare inline kind="text" field="game" sport={l.sport} value={l.game} display={displayGame(l.game, names)} empty="no game" label={`Leg ${i + 1} game`} onEdit={onEdit} onSave={(v) => saveLeg(i, { game: v })} /> },
                    { text: l.sport, node: <Cell bare inline kind="text" field="sport" value={l.sport} empty="sport" label={`Leg ${i + 1} sport`} onEdit={onEdit} onSave={(v) => saveLeg(i, { sport: v })} /> },
                    { text: l.market, node: <Cell bare inline kind="text" field="market" sport={l.sport} value={l.market} empty="market" label={`Leg ${i + 1} market`} onEdit={onEdit} onSave={(v) => saveLeg(i, { market: v })} /> },
                  ]}
                </SubLine>
              </td>
              <td />
              <Cell kind="odds" value={formatOdds(l.odds)} label={`Leg ${i + 1} odds`} onSave={(v) => saveLeg(i, { odds: v.trim() ? (oddsFromText(v) ?? l.odds) : null })} right />
              <td />
              <Cell kind="select" options={[...RESULTS]} labels={RESULT_LABEL} value={l.result} extraClass={`font-medium ${TONE_TEXT[lt]}`} label={`Leg ${i + 1} result`} onSave={(v) => saveLeg(i, { result: v as Result })} />
              <td />
            </tr>
          );
        })}
    </>
  );
}

/** C (or Cash-out on the result pill): the amount returned, typed in place; Enter saves, Esc closes (BT-26). */
function CashoutBox({ bet, onDone, onClose }: { bet: Bet; onDone(amount: number): void; onClose(): void }) {
  const [amount, setAmount] = useState('');
  return (
    <form
      className="inline-flex"
      onSubmit={(e) => {
        e.preventDefault();
        const a = parseNumber(amount);
        if (a != null) onDone(a);
      }}
    >
      <input
        autoFocus
        className="field w-36 py-0.5 text-xs"
        placeholder={`Cash-out ${bet.money === 'hypothetical' ? 'H$' : 'R$'} returned`}
        aria-label="Cash-out amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        onBlur={onClose}
      />
    </form>
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
  const cashout = bet.result === 'cash-out' && bet.cashout != null ? `Cash-out: ${formatMoney(bet.cashout, bet.money)} returned` : '';
  return (
    <button
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[betTone(bet)]}`}
      onClick={() => setEditing(true)}
      title={[cashout, title, 'click to change'].filter(Boolean).join(' · ')}
      data-testid="result"
    >
      {RESULT_LABEL[bet.result]}
    </button>
  );
}

type CellProps = {
  value: string;
  label: string;
  onSave(v: string): unknown;
  display?: string;
  right?: boolean;
  /** Render without its own <td> (inside the Bet cell). */
  bare?: boolean;
  /** Inline, inside the muted line. */
  inline?: boolean;
  /** Inline in the bet text line, so an actual or a label chip can follow on the same line (BT-27). */
  flow?: boolean;
  /** Muted text shown when there is no value (default "-"). */
  empty?: string;
  /** Extra classes and tooltip on the shown value (H$ stakes, BT-14). */
  extraClass?: string;
  title?: string;
  /** The <td>'s test id and data-col (stake, odds). */
  testId?: string;
  /** Told when editing starts and ends (the muted line stops cutting its text meanwhile). */
  onEdit?(on: boolean): void;
} & (
  | { kind: 'text'; field: Field; sport?: string }
  | { kind: 'number' }
  | { kind: 'odds' }
  | { kind: 'date' }
  | { kind: 'select'; options: string[]; labels?: Record<string, string> }
);

/**
 * A cell that turns into an input on a double click (BT-25 / BT-26: a single click selects the row), or Enter when
 * focused. Enter or blur saves, Esc cancels.
 */
function Cell(props: CellProps) {
  const { suggestFor } = useApp();
  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const done = useRef(false);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    props.onEdit?.(on);
  };
  const start = () => {
    if (editing) return;
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
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done.current = true;
      setEditing(false);
    }
  };
  const td = `px-2 py-1.5 align-top ${props.right ? 'whitespace-nowrap text-right tabular-nums' : ''}`;
  const wrap = (inner: ReactNode) =>
    props.bare ? (
      inner
    ) : (
      <td className={td} data-testid={props.testId} data-col={props.testId}>
        {inner}
      </td>
    );
  if (!editing) {
    const shown = props.display ?? (props.kind === 'select' ? (props.labels?.[props.value] ?? capitalize(props.value)) : props.value);
    return wrap(
      <span
        role="button"
        tabIndex={0}
        aria-label={`Edit ${props.label}`}
        title={props.title ?? 'Double click to edit'}
        className={`${props.inline ? '-mx-1 inline px-1' : props.flow ? 'inline' : props.right ? '-mr-1 block pr-1' : 'block'} min-h-4 cursor-text rounded hover:bg-zinc-800 ${props.bare || props.extraClass ? '' : 'text-zinc-200'} ${props.extraClass ?? ''}`}
        onDoubleClick={start}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            start();
          }
        }}
      >
        {shown || <span className={props.empty ? 'font-normal text-zinc-600' : 'text-zinc-700'}>{props.empty ?? '-'}</span>}
      </span>,
    );
  }
  const cls = 'field py-0.5 text-sm font-normal';
  return wrap(
    <span className={props.inline ? 'inline-block w-48 align-middle' : 'block'} onClick={(e) => e.stopPropagation()}>
      {props.kind === 'text' ? (
        <Autocomplete autoFocus className={`${cls} w-full`} value={draft} onChange={setDraft} getSuggestions={(q) => suggestFor(props.field, q, props.sport)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
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
        <OddsInput autoFocus className={`${cls} w-full min-w-0`} value={draft} onChange={setDraft} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      ) : (
        <input autoFocus className={`${cls} w-full min-w-0`} value={draft} inputMode={props.kind === 'number' ? 'decimal' : undefined} placeholder={props.kind === 'date' ? 'dd/mm/yyyy' : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      )}
    </span>,
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
