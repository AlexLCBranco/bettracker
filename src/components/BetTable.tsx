'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { formatDate, formatDayHeader, formatDayMonth, parseDateInput } from '@/lib/dates';
import { betLabel, duplicateDutchDraft, dutchSummary, editDutchDraft, rowBets, rowKey, type GroupOutcome } from '@/lib/dutch';
import { DescriptionMark, DescriptionRow, type DescriptionControl } from './Description';
import { WhatIfPanel, type WhatIfControl } from './WhatIf';
import { footballDayUrl, nbaSlateUrl } from '@/lib/dayLinks';
import { duplicateForm } from '@/lib/form';
import { formatMoney, formatOdds, MONEY_SYMBOL, oddsFromText, parseNumber, profit, profitMoney, winReturn, type MoneyScope } from '@/lib/money';
import { MONEY_TEXT, MONEY_TITLE } from './moneyStyle';
import { cashoutLabel, cashoutLine, readCashout, type CashoutMode } from '@/lib/cashout';
import { useCashoutMode } from './useCashoutMode';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result, type WouldHave } from '@/lib/types';
import { WouldaChip } from './Woulda';
import { useUnitsView } from './Money';
import { asUnitBets, formatUnits, toUnits } from '@/lib/units';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { OddsInput } from './OddsInput';
import { comboHits, dutchHits, missesTitle } from '@/lib/hits';
import { tidyText } from '@/lib/tidy';
import { DutchSettleButtons } from './DutchSettle';
import { GameTarget } from './GameEditor';
import { isNoBrainer, NB_TINT, NoBrainerButton, NoBrainerChip, useToggleNoBrainer } from './NoBrainer';
import { linksForBets, siteMark, siteName, type GameLink } from '@/lib/gameLinks';
import { betTone, groupTone, resultTone, type Tone } from '@/lib/tone';
import { TONE_BADGE, TONE_EDGE, TONE_INNER, TONE_RAIL, TONE_TEXT } from './tone';
import { dayGames, type DayGame } from '@/lib/gamesInvolved';
import { betResultLine, betsText, displayGame, dutchResultLine, legGames, legMarkets, type DayGroup } from '@/lib/table';
import type { Settler } from './useSettle';
import { losingLegs, sharedLabel } from '@/lib/actuals';
import { normalize } from '@/lib/autocomplete';
import { Annotator, LabelChip, LossLine } from './Annotator';
import { bankAgainNeeds, chainLegs, chainPending, chainSummary, firstFactor, goalText, isLadder, ladderOf, ladderProgress, ladderStrip, needsText, tierOf, type ChainOutcome } from '@/lib/rollover';
import type { Rollover } from './useRollover';

const QUICK_RESULTS: { r: Result; key: string; cls: string }[] = [
  { r: 'won', key: 'W', cls: 'hover:bg-emerald-600/40 text-emerald-400' },
  { r: 'lost', key: 'L', cls: 'hover:bg-red-600/40 text-red-400' },
  { r: 'void', key: 'V', cls: 'hover:bg-zinc-600/40 text-zinc-300' },
];

/**
 * BT-18: one size and weight on every row (bet, combination, dutch). BT-38: in the units view, `units` (or the value
 * over `unitSize`) shows as "+0,45u"; without either it stays money.
 */
export function ProfitText({ value, pending, money = 'real', unitSize, units }: { value: number; pending?: boolean; money?: MoneyScope; unitSize?: number | null; units?: number | null }) {
  const [view] = useUnitsView();
  if (pending) return <span className="text-zinc-500">-</span>;
  const u = view ? (units !== undefined ? units : toUnits(value, unitSize)) : null;
  return <span className={`font-semibold ${value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{u != null ? formatUnits(u, true) : formatMoney(value, money, true)}</span>;
}

/** BT-29: the odds tier as a small chip ("Semi"); "Banked Semi" on a banked bet or an open shot. None under 1.10. */
function TierChip({ odds, banked }: { odds: number; banked?: boolean }) {
  const t = tierOf(odds);
  if (!t) return null;
  return (
    <span className={`ml-1.5 inline-block whitespace-nowrap rounded px-1 align-[1px] text-[10px] font-bold uppercase leading-4 tracking-wide ${banked ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-500/10 text-sky-300'}`} title={`Odds tier: ${t}`} data-testid="tier-chip">
      {banked ? `Banked ${t}` : t}
    </span>
  );
}

/** BT-26: rows as tall as they need; the selected row (keyboard settling) is tinted. */
const ROW = 'group scroll-mt-28 border-b border-zinc-900 hover:bg-zinc-900/50 data-[selected]:bg-emerald-500/[0.07] data-[multi]:bg-sky-500/[0.12] data-[multi]:hover:bg-sky-500/[0.16]';
/** A dutch's or rollover's own row: a header over the bets under it, set apart from the rows above. */
const GROUP_HEAD = 'bg-zinc-900/60 border-t border-t-zinc-700';
/** The last row of a group closes it. */
const GROUP_END = 'border-b-zinc-700';
const COLS = 7;
/** The muted second line of the Bet cell: one line, cut with "…" (full text on hover). */
const SUB = 'text-[11px] leading-5 text-zinc-500';
/** Bet text: bold, wraps instead of being cut (BT-26). */
const TEXT = 'font-semibold text-zinc-100 [overflow-wrap:anywhere]';
const HYPO = 'text-violet-300';
/** ✎ and ⋯: on row hover, keyboard focus and the selected row (W / L / V and the dutch settle buttons always show). */
const HOVER_ONLY = 'inline-flex opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected]:opacity-100 focus-within:opacity-100';
const CELL = 'px-2 py-1.5 align-top';
const NUM = 'whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums';
const ACTIONS = 'whitespace-nowrap px-2 py-1 text-right align-top';

/** The LIVE tag: a click switches the row's bets (a dutch or shot: all of them) to pregame, as one undo step. */
function LiveTag({ bets }: { bets: Bet[] }) {
  const { update, undoGroup } = useApp();
  return (
    <button
      type="button"
      className="rounded bg-red-500/15 px-1 py-px text-[10px] font-bold tracking-wide text-red-400 hover:bg-red-500/30 hover:text-red-200"
      title="Live bet: click to switch to pregame"
      aria-label="Switch to pregame"
      data-testid="live-tag"
      onClick={(e) => {
        e.stopPropagation();
        void undoGroup('Switched to pregame', undefined, () => Promise.all(bets.map((b) => update(b.id, { situation: 'pregame' }, {}).catch(() => undefined))));
      }}
    >
      LIVE
    </button>
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
      <span aria-hidden data-testid="connector" className={`absolute left-[15px] top-0 border-l border-zinc-500 ${last ? 'h-4' : 'h-full'}`} />
      <span aria-hidden className="absolute left-[15px] top-4 w-[17px] border-t border-zinc-500" />
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
function gamePart(bets: Bet[], names: Map<string, string>, links: GameLink[] = []): Part {
  const games = legGames(bets.flatMap((b) => b.legs), names);
  return {
    text: games.join(', '),
    node: (
      <>
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
      {links.length > 0 && <GameLinkMarks links={links} />}
      </>
    ),
  };
}

/** BT-42: one small mark per saved game page link, opening it in a new tab. Nothing at all when there is none. */
function GameLinkMarks({ links }: { links: GameLink[] }) {
  return (
    <span className="ml-1 inline-flex gap-0.5 align-baseline" data-testid="game-links">
      {links.map((l) => (
        <a
          key={l.site}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-sky-950 px-1 text-[10px] font-semibold leading-4 text-sky-300 hover:bg-sky-800 hover:text-white"
          title={`Open this game on ${siteName(l.site)}`}
          aria-label={`Open on ${siteName(l.site)}`}
          data-testid="game-link"
          data-site={l.site}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {siteMark(l.site)}
        </a>
      ))}
    </span>
  );
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
  /** BT-29: bank, add leg, close. */
  rollover: Rollover;
  /** BT-45: the rows selected together (marquee, Ctrl / Shift+click), tinted apart from the keyboard-selected row. */
  multi?: ReadonlySet<string>;
  /** BT-47: which rows show their description under them. */
  desc?: DescriptionControl;
  /** BT-49: which banked shot shows its "what if" box. */
  whatIf?: WhatIfControl;
  /** BT-50: the days showing their games instead of their bets, and what a click on a game does. */
  games?: GamesControl;
  empty?: string;
}

export interface GamesControl {
  days: ReadonlySet<string>;
  toggle(date: string): void;
  pick(g: DayGame): void;
}

/**
 * BT-26: bets as one full-width table under a header per day. Columns: [▸] [Bet: all leftover width] [Stake] [Odds]
 * [+/-] [Result] [actions]; the numbers are fixed narrow columns, so they line up on every row type. The Bet cell is
 * two lines: the bet text (wraps, never cut) and a muted line with game, sport, market, book and tags. A dutch is a
 * summary row with one such block per split under it. A click selects a row (keyboard settling), a double click edits.
 */
export function BetTable({ days, selected, select, settle, annotating, annotate, rollover, multi = NO_KEYS, desc = NO_DESC, whatIf = NO_WHATIF, games = NO_GAMES, empty = 'No bets yet. Type one in the quick-add line above.' }: TableProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [unitsView] = useUnitsView();
  const { names, gameLinks } = useApp();
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!days.length) return <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>;
  const th = 'sticky top-14 z-[2] bg-zinc-950 px-2 py-2 text-[11px] font-medium text-zinc-500 shadow-[inset_0_-1px_0_rgb(39_39_42)]';
  const row = { open, toggle, selected, multi, desc, whatIf, select, settle, annotating, annotate, rollover };

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
            <Fragment key={`${d.date}-${rowKey(d.rows[0]!)}`}>
              <tr className="border-b border-zinc-800 bg-zinc-900/70" data-testid="day-header" data-date={d.date}>
                <td colSpan={COLS} className="px-2 py-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200" data-testid="day-label">
                        {formatDayHeader(d.date)}
                      </span>
                      <DayLinks date={d.date} />
                      <GamesToggle on={games.days.has(d.date)} date={d.date} onClick={() => games.toggle(d.date)} />
                    </span>
                    <span className="tabular-nums text-zinc-400" data-testid="day-totals">
                      {betsText(d.count)}
                      {d.nets.map((n) => (
                        <Fragment key={n.money}>
                          {' · '}
                          <span className={`font-semibold ${n.money === 'hypothetical' ? HYPO : n.value > 0 ? 'text-emerald-400' : n.value < 0 ? 'text-red-400' : 'text-zinc-400'}`} data-testid={`day-net-${n.money}`}>
                            {unitsView && n.units != null ? formatUnits(n.units, true) : formatMoney(n.value, n.money, true)}
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  </div>
                </td>
              </tr>
              {games.days.has(d.date) ? (
                <DayGameRows games={dayGames(d.rows, names, gameLinks)} onPick={games.pick} />
              ) : d.rows.map((r) => (
                <Fragment key={rowKey(r)}>
                  {r.kind === 'bet' ? (
                    <BetRow b={r.bet} {...row} />
                  ) : r.kind === 'dutch' ? (
                    <DutchGroup dutchId={r.dutchId} bets={r.bets} {...row} />
                  ) : (
                    <RolloverGroup rolloverId={r.rolloverId} bets={r.bets} {...row} />
                  )}
                  {/* BT-47: the description, opened under its row (under a dutch's or chain's last line) */}
                  {desc.isOpen(rowKey(r), rowBets(r)) && <DescriptionRow rowKey={rowKey(r)} bets={rowBets(r)} cols={COLS} control={desc} />}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** BT-48: this day in calendarkit (NBA Slate) and footykit, each in a new tab. Shown on every day. */
function DayLinks({ date }: { date: string }) {
  const dm = formatDate(date).slice(0, 5);
  const cls = 'rounded px-1 text-[10px] font-semibold leading-4 text-zinc-500 hover:bg-zinc-800 hover:text-white';
  return (
    <span className="inline-flex items-center gap-0.5" data-testid="day-links">
      <a className={cls} href={nbaSlateUrl(date)} target="_blank" rel="noopener noreferrer" title={`NBA Slate, ${dm}`} data-testid="day-link-nba" onClick={(e) => e.stopPropagation()}>
        NBA
      </a>
      <a className={cls} href={footballDayUrl(date)} target="_blank" rel="noopener noreferrer" title={`Football, ${dm}`} data-testid="day-link-football" onClick={(e) => e.stopPropagation()}>
        Football
      </a>
    </span>
  );
}

/** BT-50: switches a day between its bets and its games. */
function GamesToggle({ on, date, onClick }: { on: boolean; date: string; onClick(): void }) {
  return (
    <button
      type="button"
      className={`rounded px-1 text-[10px] font-semibold leading-4 ${on ? 'bg-sky-500/25 text-sky-100' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}
      title={on ? `Show the bets of ${formatDate(date).slice(0, 5)}` : `Show the games bet on, ${formatDate(date).slice(0, 5)}`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid="day-games-toggle"
    >
      Games
    </button>
  );
}

/** BT-50: a day's games, one row each: game, sport, links, bets on it, total stake, net and pending / settled. */
function DayGameRows({ games, onPick }: { games: DayGame[]; onPick(g: DayGame): void }) {
  if (!games.length)
    return (
      <tr className="border-b border-zinc-900" data-testid="no-games">
        <td />
        <td colSpan={COLS - 1} className="px-2 py-1.5 text-xs text-zinc-500">
          No games on these bets.
        </td>
      </tr>
    );
  return (
    <>
      {games.map((g) => {
        const tone: Tone = g.pending ? 'pending' : g.profit > 0 ? 'win' : g.profit < 0 ? 'loss' : 'neutral';
        const sub = g.sports.join(', ');
        return (
          <tr key={g.key} className={`${ROW} cursor-pointer`} data-testid="game-row" data-game={g.key} data-tone={tone} onClick={() => onPick(g)} title={`${g.game}: show only the bets on it`}>
            <td className={TONE_EDGE[tone]} />
            <td className={CELL}>
              <div className={TEXT} data-testid="game-name">
                {g.game}
                {g.links.length > 0 && <GameLinkMarks links={g.links} />}
              </div>
              <div className={`${SUB} overflow-hidden text-ellipsis whitespace-nowrap`} title={sub} data-testid="game-sub">
                {sub}
              </div>
            </td>
            <td className={NUM} data-testid="game-stake" data-col="stake">
              <span className={MONEY_TEXT[g.money] || 'text-zinc-200'}>{formatMoney(g.stake, g.money)}</span>
            </td>
            <td className={NUM} />
            <td className={NUM} data-testid="profit" data-col="profit">
              <ProfitText value={g.profit} pending={g.pending === g.count} money={profitMoney(g.money)} />
            </td>
            <td className={CELL} data-col="result">
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`} data-testid="game-status" title={g.pending ? `${g.pending} of ${betsText(g.count)} pending` : 'All settled'}>
                {g.pending ? 'Pending' : 'Settled'}
              </span>
            </td>
            <td className={`${ACTIONS} text-xs text-zinc-500`} data-testid="game-count">
              {betsText(g.count)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

const NO_GAMES: GamesControl = { days: new Set(), toggle: () => {}, pick: () => {} };
const NO_KEYS: ReadonlySet<string> = new Set();
const NO_DESC: DescriptionControl = { isOpen: () => false, toggle: () => {}, close: () => {}, switchOn: false };
const NO_WHATIF: WhatIfControl = { openId: null, toggle: () => {}, close: () => {} };

const OUTCOME_LABEL: Record<GroupOutcome, string> = { pending: 'Pending', won: 'Won', lost: 'Lost', even: 'Even' };

/** The dutch's bets' shared value for a field, "Mixed" when they differ, "" when none is set. */
function shared(bets: Bet[], pick: (b: Bet) => string) {
  const vals = [...new Set(bets.map(pick).filter(Boolean))];
  return vals.length === 1 ? vals[0]! : vals.length > 1 ? 'Mixed' : '';
}

type RowProps = { open: Set<string>; toggle(id: string): void; selected: string | null; multi: ReadonlySet<string>; desc: DescriptionControl; whatIf?: WhatIfControl; select(key: string): void; settle: Settler; annotating: string | null; annotate(key: string | null): void; rollover: Rollover };

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

function DutchGroup({ bets, dutchId, open, toggle, selected, multi, desc, select, settle, annotating, annotate, rollover }: { bets: Bet[]; dutchId: string } & RowProps) {
  const { removeDutch, openDutch, names: nameCasing, gameLinks } = useApp();
  const s = dutchSummary(bets);
  // BT-38: the units view, when every split has a unit size
  const [unitsView] = useUnitsView();
  const ub = unitsView ? asUnitBets(bets) : null;
  const us = ub ? dutchSummary(ub) : null;
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
  // BT-44: the whole dutch is a no brainer
  const nb = isNoBrainer(bets);
  const toggleNB = useToggleNoBrainer();
  const annotateHere = () => {
    select(key);
    annotate(key);
  };
  return (
    <>
      <tr className={`${ROW} ${GROUP_HEAD}`} data-testid="dutch-row" data-dutch-id={dutchId} data-key={key} data-selected={isSel || undefined} data-multi={multi.has(key) || undefined} data-tone={tone} data-money={money} onClick={() => select(key)}>
        <td className={TONE_RAIL[tone]} />
        <td className={`${CELL} ${nb ? NB_TINT : ''}`} data-no-brainer={nb || undefined}>
          <div className={`${TEXT} flex items-center gap-1.5`} data-testid="bet-text" title={names}>
            <span data-testid="type">Dutch ×{bets.length}</span>
            {nb && <NoBrainerChip />}
            {label && <LabelChip label={label} />}
            <DescriptionMark rowKey={key} bets={bets} selected={isSel} control={desc} />
            {live && <LiveTag bets={bets} />}
          </div>
          <SubLine
            parts={[
              gamePart(bets, nameCasing, linksForBets(gameLinks, bets)),
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
          <span className={MONEY_TEXT[money] || 'text-zinc-200'}>{us ? formatUnits(us.stake) : formatMoney(s.stake, money)}</span>
        </td>
        <td className={`${NUM} text-zinc-200`} data-testid="dutch-odds" data-col="odds" title="Combined odds: 1 / Σ(1/odds)">
          {formatOdds(s.combinedOdds, 2)}
        </td>
        <td className={NUM} data-testid="profit" data-col="profit">
          <ProfitText value={s.profit} pending={s.outcome === 'pending'} money={profitMoney(money)} units={us ? us.profit : null} />
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
              {/* a pending dutch shows its settle buttons: its no brainer toggle is in the ⋯ menu (and X) */}
              {!pending.length && <NoBrainerButton bets={bets} />}
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
                      if (window.confirm(`Delete this dutch and its ${bets.length} bets (${formatMoney(s.stake, money)} in all: ${names})? Ctrl+Z undoes it.`)) void removeDutch(dutchId);
                    },
                  },
                  { label: 'Label / result', icon: '#', onClick: annotateHere },
                  { label: nb ? 'Remove no brainer' : 'Mark no brainer', icon: '★', onClick: () => void toggleNB(bets) },
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
          multi={multi}
          desc={desc}
          rollover={rollover}
          split={{
            groupTone: tone,
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

const CHAIN_LABEL: Record<ChainOutcome, string> = { pending: 'Pending', open: 'Open', won: 'Won', lost: 'Lost', even: 'Even' };

/**
 * BT-29: a rollover shot. One row (stake = the first bet's, odds = the product of its bets', profit = final payout −
 * first stake) with its bets under it, like a dutch's splits. An open shot shows what is banked and the odds the next
 * bet needs, with Add leg and Close.
 */
function RolloverGroup({ bets: raw, rolloverId, open, toggle, selected, multi, desc, whatIf = NO_WHATIF, select, settle, annotating, annotate, rollover }: { bets: Bet[]; rolloverId: string } & RowProps) {
  const { names: nameCasing, remove, undoGroup, bets: allBets, units } = useApp();
  // BT-39: a shot banked from a dutch split counts the whole dutch's stake in its odds
  const s = chainSummary(raw, allBets);
  const bets = s.bets;
  // BT-38: the units view, when every bet of the chain has a unit size
  const [unitsView] = useUnitsView();
  const ub = unitsView ? asUnitBets(raw) : null;
  const us = ub ? chainSummary(ub) : null;
  const tone = groupTone(chainPending(s.outcome) ? 'pending' : (s.outcome as GroupOutcome));
  const money = bets[0]!.money;
  const key = `rollover:${rolloverId}`;
  const isSel = selected === key;
  const isOpen = s.outcome === 'open';
  const last = bets.at(-1)!;
  // BT-54: a dutch placed as a leg is one leg; its splits are settled on their own rows
  const legs = chainLegs(bets);
  const legOf = new Map(legs.flatMap((l, i) => l.map((b, j) => [b.id, { n: i + 1, dutch: l.length > 1, firstInLeg: j === 0, lastInLeg: j === l.length - 1 }] as const)));
  const pendingBet = bets.find((b) => b.result === 'pending' && !legOf.get(b.id)!.dutch);
  const names = bets.map((b) => tidyText(b.betText || betLabel(b), nameCasing)).join(' → ');
  const books = [...new Set(bets.map((b) => b.book).filter(Boolean))];
  const live = bets.every((b) => b.situation === 'live');
  const shot = `Banked ${formatMoney(s.banked, money)} @ ${formatOdds(s.odds, 2)} · ${needsText(s)}`;
  // BT-53: finished under 1.80 and bankable again: what the next bet would need to make it a shot
  const again = isOpen ? null : bankAgainNeeds(raw, allBets);
  const againText = again != null ? `Finished @ ${formatOdds(s.odds, 2)} · ${needsText({ needs: again })}` : '';
  const bankable = rollover.canBank(last);
  // BT-35: a ladder: rungs, no odds target, no Shot / Mini / Semi / Pepsi chip
  const ladder = isLadder(bets);
  const progress = ladder ? ladderProgress(bets) : null;
  const strip = ladder ? ladderStrip(bets, (n) => formatMoney(n, money)) : '';
  const [goalOpen, setGoalOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <tr className={`${ROW} ${GROUP_HEAD}`} data-testid="rollover-row" data-rollover-id={rolloverId} data-key={key} data-selected={isSel || undefined} data-multi={multi.has(key) || undefined} data-tone={tone} data-money={money} data-outcome={s.outcome} onClick={() => select(key)}>
        <td className={TONE_RAIL[tone]} />
        <td className={CELL}>
          <div className={`${TEXT} flex items-center gap-1.5`} data-testid="bet-text" title={names}>
            {ladder ? (
              <>
                <span data-testid="type">Ladder ×{bets.length}</span>
                <span className={`whitespace-nowrap rounded px-1 text-[10px] font-bold uppercase leading-4 tracking-wide ${progress!.reached ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/15 text-indigo-200'}`} data-testid="ladder-goal" title={progress!.reached ? 'Goal reached' : 'Ladder progress'}>
                  {goalText(progress!, (n) => formatMoney(n, money))}
                  {progress!.reached && ' ✓'}
                </span>
              </>
            ) : (
              <>
                <span data-testid="type">Rollover ×{legs.length}</span>
                <TierChip odds={s.odds} banked={isOpen} />
                {isOpen && (
                  <button
                    type="button"
                    className={`rounded px-1 text-[10px] font-bold leading-4 ${whatIf.openId === rolloverId ? 'bg-sky-500/30 text-sky-100' : 'text-sky-400 hover:bg-sky-500/20 hover:text-sky-100'}`}
                    title="What if: try a next-leg odd and see the final shot (I)"
                    aria-label="What if"
                    aria-expanded={whatIf.openId === rolloverId}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(key);
                      whatIf.toggle(rolloverId);
                    }}
                    data-testid="whatif-toggle"
                  >
                    what if
                  </button>
                )}
              </>
            )}
            {live && <LiveTag bets={raw} />}
            <DescriptionMark rowKey={key} bets={raw} selected={isSel} control={desc} />
          </div>
          <SubLine
            parts={[
              isOpen && !ladder && {
                text: shot,
                node: (
                  <span className="text-sky-300" data-testid="shot-line">
                    {shot}
                  </span>
                ),
              },
              !!againText && {
                text: againText,
                node: (
                  <span className="text-sky-300" data-testid="again-line">
                    {againText}
                  </span>
                ),
              },
              { text: names, node: <span className="text-zinc-300">{names}</span> },
              books.length > 0 && { text: books.join(', '), node: books.join(', ') },
            ]}
          />
          {/* BT-35: the rung strip wraps, never cut */}
          {ladder && (
            <div className="text-[12px] leading-5 text-indigo-200 [overflow-wrap:anywhere]" data-testid="ladder-strip">
              {strip}
            </div>
          )}
          {goalOpen && ladder && (
            <GoalEditor
              goal={ladderOf(bets)}
              money={money}
              onSave={(g) => {
                rollover.setGoal(bets, g);
                setGoalOpen(false);
              }}
              onClose={() => setGoalOpen(false)}
            />
          )}
        </td>
        <td className={NUM} data-testid="rollover-stake" data-col="stake" title="The first bet's stake: the rolled stakes are the same money">
          <span className={MONEY_TEXT[money] || 'text-zinc-200'}>{us ? formatUnits(us.stake) : formatMoney(s.stake, money)}</span>
        </td>
        <td className={`${NUM} text-zinc-200`} data-testid="rollover-odds" data-col="odds" title={s.baseStake !== s.stake ? `The bets' odds multiplied, the dutch split counted on the whole dutch's stake (${formatMoney(s.baseStake, money)})` : "The bets' odds multiplied (a void counts 1.00)"}>
          {formatOdds(s.odds, 2)}
        </td>
        <td className={NUM} data-testid="profit" data-col="profit">
          <ProfitText value={s.profit} pending={chainPending(s.outcome)} money={profitMoney(money)} units={us ? us.profit : null} />
        </td>
        <td className={CELL} data-col="result">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${isOpen ? 'bg-sky-500/15 text-sky-300' : TONE_BADGE[tone]}`} data-testid="result">
            {CHAIN_LABEL[s.outcome]}
          </span>
        </td>
        <td className={ACTIONS}>
          <span className="inline-flex items-center gap-0.5">
            {isOpen && ladder && (
              <>
                <button
                  className="rounded px-1.5 py-0.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                  title="The next rung: the whole payout is its stake (A)"
                  onClick={(e) => {
                    e.stopPropagation();
                    select(key);
                    rollover.addLeg(bets);
                  }}
                  data-testid="next-rung"
                >
                  + Next rung
                </button>
                <button
                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30"
                  title="Take the money: close the ladder as won at this amount"
                  onClick={(e) => {
                    e.stopPropagation();
                    rollover.take(bets);
                  }}
                  data-testid="take"
                >
                  Take {formatMoney(s.banked, money)}
                </button>
              </>
            )}
            {isOpen && !ladder && (
              <>
                <button
                  className="rounded px-1.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                  title="Add the next bet with the banked payout (A)"
                  onClick={(e) => {
                    e.stopPropagation();
                    select(key);
                    rollover.addLeg(bets);
                  }}
                  data-testid="add-leg"
                >
                  + Add leg
                </button>
                <button
                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                  title="Dutch the banked payout across several selections as the next leg (opens the Betting Tool)"
                  onClick={(e) => {
                    e.stopPropagation();
                    select(key);
                    router.push(`/betting-tool?rollover=${encodeURIComponent(rolloverId)}`);
                  }}
                  data-testid="dutch-leg"
                >
                  + Dutch leg
                </button>
                <button
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  title="Close the shot: no more legs (B)"
                  onClick={(e) => {
                    e.stopPropagation();
                    rollover.close(bets);
                  }}
                  data-testid="close-shot"
                >
                  Close
                </button>
              </>
            )}
            {pendingBet &&
              QUICK_RESULTS.map(({ r, key: k, cls }) => (
                <button
                  key={r}
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}
                  title={`${RESULT_LABEL[r]} (${k})`}
                  aria-label={`Mark ${RESULT_LABEL[r]}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    settle.settleBet(pendingBet, r, null, [pendingBet]);
                  }}
                >
                  {k}
                </button>
              ))}
            {pendingBet && <CashoutButton onClick={() => settle.startCashout(pendingBet.id)} />}
            <span className={HOVER_ONLY} data-testid="row-actions">
              {/* BT-53: Bank on the chain's row banks its last bet, the same as the child row's Bank */}
              {bankable && (
                <button
                  className="rounded px-1.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                  title="Bank for rollover: keep the payout for the next bet (B)"
                  onClick={(e) => {
                    e.stopPropagation();
                    rollover.bank(last);
                  }}
                  data-testid="bank"
                >
                  Bank
                </button>
              )}
              <RowMenu
                label={ladder ? 'More ladder actions' : 'More rollover actions'}
                items={[
                  ...(bankable ? [{ label: 'Bank for rollover', icon: '⤴', onClick: () => rollover.bank(last) }] : []),
                  ...(isOpen && !ladder ? [{ label: 'Close shot', icon: '■', onClick: () => rollover.close(bets) }] : []),
                  ...(ladder ? [{ label: 'Set goal', icon: '◎', onClick: () => setGoalOpen(true) }] : []),
                  // BT-36: plan the remaining rungs in the Ladder sim
                  ...(ladder && chainPending(s.outcome) ? [{ label: 'Open in sim', icon: '↗', onClick: () => router.push(`/ladder-sim?ladder=${encodeURIComponent(rolloverId)}`) }] : []),
                  {
                    label: ladder ? 'Delete ladder' : 'Delete rollover',
                    icon: '🗑',
                    danger: true,
                    onClick: () => {
                      if (window.confirm(`Delete this ${ladder ? 'ladder' : 'rollover'} and its ${bets.length} bets (${names})? Ctrl+Z undoes it.`))
                        void undoGroup(`Deleted a ${ladder ? 'ladder' : 'rollover'} (${bets.length} bets)`, undefined, async () => {
                          for (const b of bets) await remove(b.id);
                        });
                    },
                  },
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
          multi={multi}
          desc={desc}
          rollover={rollover}
          link={{ groupTone: tone, index: i, leg: legOf.get(b.id)!, last: i === bets.length - 1 && !open.has(b.id), chainKey: key, chain: bets, ladder, current: ladder && (b.result === 'pending' || (isOpen && i === bets.length - 1)) }}
        />
      ))}
      {/* BT-49: the "what if" box opens under the shot, never widening a column */}
      {isOpen && !ladder && whatIf.openId === rolloverId && (
        <tr className="border-b border-zinc-900 bg-sky-500/[0.04]" data-testid="whatif-row">
          <td />
          <td colSpan={COLS - 1} className="px-2 py-1.5">
            <WhatIfPanel
              shot={s}
              needs={s.needs}
              money={money}
              unitSize={bets[0]!.unitSize ?? units.unitSizes[money]}
              onPlace={(next) => {
                whatIf.close();
                rollover.addLeg(bets, next);
              }}
              onClose={whatIf.close}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** BT-29: a bet shown under its rollover shot. */
interface ChainLink {
  index: number;
  /** BT-54: the leg it is in (a dutch leg's splits share one), shown "Bet 2 · dutch". */
  leg: { n: number; dutch: boolean; firstInLeg: boolean; lastInLeg: boolean };
  /** The shot's tone: its rail runs down the left of every bet under it. */
  groupTone: Tone;
  last: boolean;
  chainKey: string;
  chain: Bet[];
  /** BT-35: a ladder's rung ("Rung 2"); the rung being played is highlighted. */
  ladder?: boolean;
  current?: boolean;
}

interface Split {
  /** The dutch's tone: its rail runs down the left of every split. */
  groupTone: Tone;
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

function BetRow({ b, open, toggle, selected, multi, desc, select, settle, split, link, annotating, annotate, rollover }: { b: Bet; split?: Split; link?: ChainLink } & RowProps) {
  const { update, remove, openEdit, openNew, names, bets: allBets, gameLinks } = useApp();
  // BT-38: amounts in units when the view is on and the bet has a unit size
  const [unitsView] = useUnitsView();
  const inUnits = unitsView && b.unitSize ? (n: number, signed = false) => formatUnits(n / b.unitSize!, signed) : undefined;
  // an edit in a cell is one undo step (Ctrl+Z)
  const save = (patch: Partial<BetInput>) => update(b.id, patch, {}).catch(() => undefined);
  const saveLeg = (i: number, patch: Partial<Leg>) => save({ legs: b.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const nested = !!split;
  const expanded = open.has(b.id);
  const solo = b.type === 'solo';
  const combo = b.type === 'combination';
  const tone = betTone(b);
  const key = `bet:${b.id}`;
  const indent = nested || !!link;
  // a split or a shot's bet: under its group's row, on the group's rail
  const child = indent;
  const subDutch = !!link?.leg.dutch;
  const isSel = selected === key || (nested && selected === split.dutchKey) || (!!link && selected === link.chainKey);
  const inMulti = multi.has(key) || (nested && multi.has(split.dutchKey)) || (!!link && multi.has(link.chainKey));
  // BT-29: Bank on a won or positive cash-out bet or dutch split (in a shot only its last bet, once closed)
  const bankable = rollover.canBank(b);
  // BT-35: a won plain bet can become rung 1 of a ladder
  const startable = !nested && !link && rollover.canStartLadder(b);
  // a dutch's bets are logged without bet text: its selection is the text, edited on the leg (also under its shot
  // once a split is banked)
  const fromDutch = nested || !!b.dutchId;
  const textOnLeg = !b.betText && solo && fromDutch;
  const rawText = b.betText || (fromDutch ? betLabel(b) : '');
  const text = rawText && tidyText(rawText, names);
  const hits = comboHits(b);
  const leg0 = b.legs[0];
  const pending = b.result === 'pending';
  const returns = pending ? `Returns ${formatMoney(winReturn(b), profitMoney(b.money))} if it wins` : undefined;
  // BT-27: the label chip (a split shows its own only when it differs from the dutch's), a solo's actual, losing legs
  const chip = b.label && !(nested && normalize(b.label) === normalize(split.sharedLabel)) ? b.label : '';
  const soloActual = solo ? (leg0?.actual ?? '') : '';
  const group = split?.group ?? [b];
  const losses = losingLegs(b, split?.group ?? []);
  // BT-52: every bet cell has its notes mark, so the text always flows inline with what follows it
  const flow = true;
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
      <tr className={`${ROW} ${child && (split?.last ?? link!.last) ? GROUP_END : ''}`} data-testid="bet-row" data-bet-id={b.id} data-child={child || undefined} data-key={key} data-nested={nested || undefined} data-split-of={nested ? split.dutchKey.slice(6) : undefined} data-selected={isSel || undefined} data-multi={inMulti || undefined} data-tone={tone} data-money={b.money} onClick={() => select(key)}>
        <td className={`relative px-1 align-top ${child ? TONE_RAIL[(split ?? link)!.groupTone] : TONE_EDGE[tone]}`}>
          {nested && <Connector last={split.last} />}
          {link && <Connector last={link.last} />}
          {combo && (
            <span className={`${indent ? 'relative ml-3' : ''} inline-flex pt-1`}>
              <Chevron expanded={expanded} noun="legs" onClick={() => toggle(b.id)} />
            </span>
          )}
        </td>
        <td className={`${CELL} ${child ? `relative ${TONE_INNER[tone]} ${subDutch ? 'pl-8' : 'pl-3'}` : ''} ${b.noBrainer && !nested ? NB_TINT : ''}`} data-no-brainer={(b.noBrainer && !nested) || undefined}>
          {/* BT-54: a dutch leg's splits in a shot: a second bracket joins them */}
          {subDutch && (
            <>
              <span aria-hidden data-testid="sub-connector" className={`absolute left-3 border-l border-zinc-500 ${link!.leg.firstInLeg ? 'top-4' : 'top-0'} ${link!.leg.lastInLeg ? 'h-0' : 'bottom-0'}`} />
              <span aria-hidden className="absolute left-3 top-4 w-3.5 border-t border-zinc-500" />
            </>
          )}
          <div className="flex items-start gap-1.5">
            {link && (
              <span className={`mt-px shrink-0 text-[10px] leading-4 ${link.current ? 'rounded bg-indigo-500/20 px-1 font-semibold text-indigo-200' : 'text-zinc-500'}`} data-testid="chain-label" data-current={link.current || undefined}>
                {link.ladder ? 'Rung' : 'Bet'} {link.leg.n}
                {link.leg.dutch && ' · dutch'}
              </span>
            )}
            {/* a stand-alone solo is tagged "Solo", as a dutch is "Dutch ×n" (splits and a shot's bets have their own label) */}
            {solo && !indent && (
              <span className="mt-0.5 shrink-0 rounded border border-cyan-400/40 bg-cyan-400/15 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-cyan-300" data-testid="type">
                Solo
              </span>
            )}
            {/* a stand-alone combo gets the same chip in its own color; double click still changes its type */}
            {combo && !indent && (
              <span className="mt-0.5 shrink-0" data-testid="type">
                <Cell bare kind="select" options={['solo', 'combination']} labels={{ solo: 'Solo', combination: 'Combo' }} display={`Combo ×${b.legs.length}`} extraClass="rounded border border-fuchsia-400/40 bg-fuchsia-400/15 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-fuchsia-300 hover:bg-fuchsia-400/25" value={b.type} label="Type" onSave={setType} />
              </span>
            )}
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
              {b.noBrainer && !nested && <NoBrainerChip />}
              {chip && <LabelChip label={chip} />}
              {/* BT-52: a dutch split or a chain's bet has its own notes, opened by hand (the switch opens its row's) */}
              <DescriptionMark rowKey={key} bets={[b]} selected={selected === key} control={desc} byHand={nested || !!link} />
              <WouldaChip bet={b} fmt={inUnits} />
              {(link || b.banked) && !b.ladder && <TierChip odds={b.dutchId && (!link || link.index === 0) ? firstFactor(b, allBets) : b.odds} banked={b.banked && (link ? link.index === link.chain.length - 1 : rollover.chainOf(b).length === 1)} />}
            </div>
          </div>
          <SubLine
            parts={[gamePart([b], names, split ? [] : linksForBets(gameLinks, [b]))]}
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
              combo && indent && {
                text: `Combo ×${b.legs.length}`,
                node: (
                  <span data-testid="type">
                    <Cell bare inline kind="select" options={['solo', 'combination']} labels={{ solo: 'Solo', combination: 'Combo' }} display={`Combo ×${b.legs.length}`} extraClass="text-zinc-300" value={b.type} label="Type" onEdit={onEdit} onSave={setType} />
                  </span>
                ),
              },
              b.situation === 'live' && !(nested && split.live) && { text: 'LIVE', node: <LiveTag bets={[b]} /> },
              resultLinePart(betResultLine(b)),
            ]}
          </SubLine>
          {losses.length > 0 && <LossLine entries={losses} />}
          {annotating === key && <Annotator kind="bet" bet={b} group={split?.group ?? [b]} onClose={() => annotate(null)} />}
        </td>
        <Cell kind="number" testId="stake" value={String(b.stake)} display={inUnits ? inUnits(b.stake) : formatMoney(b.stake, b.money)} extraClass={MONEY_TEXT[b.money] || undefined} title={[b.money !== 'real' ? MONEY_TITLE[b.money] : '', returns].filter(Boolean).join(' · ') || undefined} label="Stake" onSave={(v) => save({ stake: parseNumber(v) ?? b.stake })} right />
        <Cell kind="odds" testId="odds" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save({ odds: oddsFromText(v) ?? b.odds })} right />
        <td className={NUM} data-testid="profit" data-col="profit">
          <ProfitText value={profit(b)} pending={pending} money={profitMoney(b.money)} unitSize={b.unitSize} />
        </td>
        <td className={CELL} data-col="result">
          <ResultCell bet={b} fmt={inUnits} title={hits ? missesTitle(hits) : undefined} onPick={(r) => settle.settleBet(b, r, null, group)} onWouldHave={(w) => {
            select(key);
            settle.wouldHave(b, w);
          }} />
        </td>
        <td className={ACTIONS}>
          {settle.cashoutFor === b.id ? (
            <CashoutBox bet={b} onDone={(a) => settle.settleBet(b, 'cash-out', a, group)} onClose={settle.cancelCashout} />
          ) : nested ? (
            <span className="inline-flex items-center gap-0.5">
              {pending && <CashoutButton onClick={() => settle.startCashout(b.id)} />}
              <span className={HOVER_ONLY} data-testid="row-actions">
                {bankable && (
                  <button
                    className="rounded px-1.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                    title="Bank for rollover: this split's payout starts a shot (B)"
                    onClick={(e) => {
                      e.stopPropagation();
                      rollover.bank(b);
                    }}
                    data-testid="bank"
                  >
                    Bank
                  </button>
                )}
                <AnnotateButton onClick={annotateHere} />
              </span>
            </span>
          ) : (
            (
              <span className="inline-flex items-center gap-0.5">
                {/* BT-18 / BT-23: W / L / V always on unsettled bets (a settled one changes from its result pill) */}
                {pending &&
                  QUICK_RESULTS.map(({ r, key: k, cls }) => (
                    <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`} title={`${RESULT_LABEL[r]} (${k})`} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle.settleBet(b, r, null, group)}>
                      {k}
                    </button>
                  ))}
                {pending && <CashoutButton onClick={() => settle.startCashout(b.id)} />}
                <span className={HOVER_ONLY} data-testid="row-actions">
                  {bankable && (
                    <button
                      className="rounded px-1.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30"
                      title="Bank for rollover: keep the payout for a later bet (B)"
                      onClick={(e) => {
                        e.stopPropagation();
                        rollover.bank(b);
                      }}
                      data-testid="bank"
                    >
                      Bank
                    </button>
                  )}
                  {startable && (
                    <button
                      className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                      title="Start a ladder: this win is rung 1, its whole payout goes on the next rung"
                      onClick={(e) => {
                        e.stopPropagation();
                        rollover.startLadder(b);
                      }}
                      data-testid="start-ladder"
                    >
                      Start ladder
                    </button>
                  )}
                  <NoBrainerButton bets={[b]} />
                  <AnnotateButton onClick={annotateHere} />
                  <IconButton label="Edit" onClick={() => openEdit(b)}>
                    ✎
                  </IconButton>
                  <RowMenu
                    label="More actions"
                    items={[
                      ...(bankable ? [{ label: 'Bank for rollover', icon: '⤴', onClick: () => rollover.bank(b) }] : []),
                      ...(startable ? [{ label: 'Start ladder', icon: '⇈', onClick: () => rollover.startLadder(b) }] : []),
                      ...(b.rolloverId && !nested ? [{ label: `Remove from ${link?.ladder ? 'ladder' : 'rollover'}`, icon: '⤓', onClick: () => rollover.detach(b) }] : []),
                      { label: 'Duplicate', icon: '⧉', onClick: () => openNew(duplicateForm(b)) },
                      {
                        label: 'Delete',
                        icon: '🗑',
                        danger: true,
                        onClick: () => {
                          if (window.confirm(`Delete this bet (${formatMoney(b.stake, b.money)} @${formatOdds(b.odds)} ${text})? Ctrl+Z undoes it.`)) void remove(b.id);
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
      {(nested || !!link) && desc.isOpen(key, [b], true) && <DescriptionRow rowKey={key} bets={[b]} cols={COLS} control={desc} />}
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
            <tr key={l.id} className={`${ROW} text-xs`} data-testid="leg-row" data-leg-of={b.id} data-lost={legLost || undefined} data-tone={lt}>
              <td className={`relative px-1 ${TONE_EDGE[lt]}`}>
                <Connector last={i === b.legs.length - 1 && (nested ? split.last : link ? link.last : true)} />
              </td>
              <td className={`${CELL} ${indent ? 'pl-9' : 'pl-5'}`}>
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
              <td className={CELL} data-col="result">
                <LegResult leg={l} bet={b} n={i + 1} onPick={(r) => settle.settleLeg(group, b, i, r)} />
              </td>
              <td />
            </tr>
          );
        })}
    </>
  );
}

/** BT-35: a ladder's goal: a number of rungs or a target amount (either can be empty). Enter saves, Esc closes. */
function GoalEditor({ goal, money, onSave, onClose }: { goal: { goalRungs: number | null; goalAmount: number | null }; money: MoneyScope; onSave(g: { goalRungs: number | null; goalAmount: number | null }): void; onClose(): void }) {
  const [rungs, setRungs] = useState(goal.goalRungs == null ? '' : String(goal.goalRungs));
  const [amount, setAmount] = useState(goal.goalAmount == null ? '' : String(goal.goalAmount));
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2 text-xs"
      data-testid="goal-editor"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const r = rungs.trim() ? Math.round(parseNumber(rungs) ?? 0) : null;
        const a = amount.trim() ? parseNumber(amount) : null;
        if ((r != null && r < 1) || (amount.trim() && a == null)) return;
        onSave({ goalRungs: r, goalAmount: a });
      }}
    >
      <span className="text-zinc-400">Goal:</span>
      <input autoFocus className="field w-20 py-0.5 text-xs" inputMode="numeric" placeholder="rungs" value={rungs} onChange={(e) => setRungs(e.target.value)} aria-label="Goal rungs" />
      <span className="text-zinc-500">or</span>
      <input className="field w-28 py-0.5 text-xs" inputMode="decimal" placeholder={`${MONEY_SYMBOL[money]} amount`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Goal amount" />
      <button type="submit" className="btn py-0.5 text-xs">
        Save goal
      </button>
    </form>
  );
}

/** BT-34: "C", blue, after W / L / V: opens the cash-out box on this bet (same as C on the selected row). */
function CashoutButton({ onClick }: { onClick(): void }) {
  return (
    <button
      className="rounded px-1.5 py-0.5 text-xs font-bold text-blue-500 hover:bg-blue-600/40 hover:text-blue-300"
      title="Cash-out (C)"
      aria-label="Mark Cash-out"
      data-testid="cashout-button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      C
    </button>
  );
}

/**
 * C (or the C button, or Cash-out on the result pill): the money returned or a percentage of the full payout, typed in
 * place (BT-34). The line under it shows both values and the profit. Enter saves, Esc closes (BT-26).
 */
function CashoutBox({ bet, onDone, onClose }: { bet: Bet; onDone(amount: number): void; onClose(): void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useCashoutMode();
  const box = useRef<HTMLFormElement>(null);
  // BT-38: "1,45u" in units of the bet's own unit size (else the current one of its money type)
  const { units } = useApp();
  const unitSize = bet.unitSize ?? units.unitSizes[bet.money];
  const read = readCashout(text, mode, bet.stake, bet.odds, unitSize);
  const noUnit = !read && /\du$/i.test(text.trim()) && !unitSize;
  const shownMode: CashoutMode = text.trim().endsWith('%') ? 'percent' : mode;
  const sym = MONEY_SYMBOL[bet.money];
  return (
    <form
      ref={box}
      className="flex flex-col items-end gap-0.5 whitespace-normal"
      data-testid="cashout-box"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (read) onDone(read.amount);
      }}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          className="field w-36 py-0.5 text-xs"
          placeholder={shownMode === 'percent' ? '% of full payout' : `Cash-out ${sym} returned`}
          aria-label="Cash-out amount"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        />
        <span role="radiogroup" aria-label="Cash-out typed as" className="inline-flex rounded border border-zinc-700 text-[11px]">
          {(['amount', 'percent'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={shownMode === m}
              className={`px-1.5 py-0.5 ${shownMode === m ? 'bg-blue-500/25 text-blue-200' : 'text-zinc-400 hover:text-white'}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setMode(m);
                // the sign and the toggle say the same thing: drop a "%" that now contradicts it
                if (m === 'amount') setText((t) => t.replace(/\s*%\s*$/, ''));
              }}
            >
              {m === 'amount' ? sym : '%'}
            </button>
          ))}
        </span>
      </span>
      {noUnit && (
        <span className="max-w-[260px] text-right text-[11px] leading-4 text-amber-300" data-testid="cashout-preview">
          No unit size for {sym}: set it on the Bankroll page
        </span>
      )}
      {read && (
        <span className="max-w-[260px] text-right text-[11px] leading-4 text-zinc-400" data-testid="cashout-preview">
          {cashoutLine(read, bet.money)} · profit <span className={read.profit > 0 ? 'text-emerald-400' : read.profit < 0 ? 'text-red-400' : 'text-zinc-300'}>{formatMoney(read.profit, bet.money, true)}</span>
        </span>
      )}
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

const LEG_KEYS: { r: Result; key: string; cls: string }[] = [...QUICK_RESULTS, { r: 'pending', key: '?', cls: 'hover:bg-zinc-600/40 text-zinc-400' }];

/**
 * BT-28: a leg's result. Pending on a pending bet: W / L / V buttons. Pending on a settled bet: "?" (not known which
 * leg lost) with W / L. Settled: its result; a click brings the buttons back to change it (? = back to pending).
 */
function LegResult({ leg, bet, n, onPick }: { leg: Leg; bet: Bet; n: number; onPick(r: Result): void }) {
  const [editing, setEditing] = useState(false);
  const unknown = leg.result === 'pending' && bet.result !== 'pending';
  const keys = editing ? LEG_KEYS.filter((k) => k.r !== leg.result) : leg.result !== 'pending' ? [] : unknown ? QUICK_RESULTS.filter((k) => k.r !== 'void') : QUICK_RESULTS;
  const pick = (r: Result) => {
    setEditing(false);
    onPick(r);
  };
  const buttons = keys.map(({ r, key: k, cls }) => (
    <button
      key={r}
      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}
      title={`Leg ${n}: ${RESULT_LABEL[r]}`}
      aria-label={`Mark leg ${n} ${RESULT_LABEL[r]}`}
      onClick={(e) => {
        e.stopPropagation();
        pick(r);
      }}
    >
      {k}
    </button>
  ));
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap" data-testid="leg-result" data-result={leg.result} data-unknown={unknown || undefined} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}>
      {unknown && !editing && (
        <span className="px-1 text-xs font-semibold text-zinc-400" title="Not known which leg lost: click the one that did">
          ?
        </span>
      )}
      {leg.result !== 'pending' && !editing ? (
        <button className={`rounded px-1 py-0.5 text-xs font-medium ${TONE_TEXT[resultTone(leg.result)]} hover:bg-zinc-800`} title="Click to change" aria-label={`Leg ${n} result: ${RESULT_LABEL[leg.result]}`} onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
          {RESULT_LABEL[leg.result]}
        </button>
      ) : (
        buttons
      )}
    </span>
  );
}

function ResultCell({ bet, onPick, title, onWouldHave, fmt }: { bet: Bet; onPick(r: Result): void; title?: string; onWouldHave?(w: WouldHave): void; fmt?: (n: number) => string }) {
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
  // BT-34: a cash-out shows the amount returned and its share of the full payout, on the pill and in its tooltip
  const cashout = bet.result === 'cash-out' && bet.cashout != null ? cashoutLabel(bet.cashout, bet.stake, bet.odds, bet.money, fmt) : '';
  if (cashout) {
    const amount = cashout.slice('Cash-out · '.length);
    // BT-37: the pill keeps its size, W / L sit beside it. BT-51: while no would-have is set they stay on screen (in
    // the space the hover ones used, so nothing moves); once answered they show on hover only, to change or clear it.
    const open = !bet.wouldHave;
    return (
      <span className="group/co relative inline-block">
        <button
          className={`relative rounded-xl px-2 py-0.5 text-left text-xs font-medium leading-4 ${TONE_BADGE[betTone(bet)]}`}
          onClick={() => setEditing(true)}
          title={[cashout, title, 'click to change'].filter(Boolean).join(' · ')}
          data-testid="result"
        >
          <span className="block whitespace-nowrap">{RESULT_LABEL[bet.result]}</span>
          <span className="block text-[10px] font-normal tabular-nums" data-testid="cashout-amount">
            {amount}
          </span>
        </button>
        {onWouldHave && (
          <span className={`absolute left-full top-1/2 z-10 flex -translate-y-1/2 gap-px pl-0.5 ${open ? '' : 'invisible group-hover/co:visible'}`} title={open ? 'W / L: what would have happened' : undefined} data-testid="woulda-keys" data-open={open || undefined}>
            {(['won', 'lost'] as const).map((w) => (
              <button
                key={w}
                className={`rounded px-0.5 text-[10px] font-bold leading-4 hover:bg-zinc-800 ${bet.wouldHave === w ? 'text-zinc-200' : 'text-zinc-500'}`}
                title={bet.wouldHave === w ? `Clear "woulda ${w}" (${w === 'won' ? 'W' : 'L'})` : `Woulda ${w} (${w === 'won' ? 'W' : 'L'})`}
                aria-label={`Woulda ${w}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onWouldHave(w);
                }}
              >
                {w === 'won' ? 'W' : 'L'}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  }
  return (
    <button
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[betTone(bet)]}`}
      onClick={() => setEditing(true)}
      title={[title, 'click to change'].filter(Boolean).join(' · ')}
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
