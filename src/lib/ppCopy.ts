// "Copy table" on a batch's PPs tab (owner, 2026-11-27): every PP of the batch as a table in the page's style (PP, legs,
// odds, stake, potential, status), to paste somewhere and recheck the PPs later. Two forms: plain text (one line per
// PP, columns split by " | ") and an HTML table for apps that paste tables.
import { formatDate } from './dates';
import { formatMoney, formatOdds, profitMoney } from './money';
import { sameGameClashes, shotPairRepeats } from './ppBuilder';
import { STATUS_LABEL, ticketStake, ticketView, type PPBatch, type TicketView } from './pp';

export const COPY_HEADER = ['PP', 'Legs', 'Odds', 'Stake', 'Potential', 'Status'] as const;

/** One PP's cells, as the PPs tab shows them. `clash`: it holds two legs from the same game. */
export function ticketRow(v: TicketView, batch: Pick<PPBatch, 'stake' | 'money'>, clash = false, repeat = false): string[] {
  const pm = profitMoney(batch.money);
  const left = v.status !== 'won' && v.status !== 'dead' && v.status !== 'void' ? ` (${v.left} left)` : '';
  return [
    `PP ${v.ticket.number}${v.ticket.placed ? '' : ' (not placed)'}${clash ? ' ⚠ same game' : ''}${repeat ? ' ⚠ shots repeat' : ''}`,
    v.legs.map((l) => l.selection).join(', '),
    `${formatOdds(v.odds, 2)}${v.estimated ? ' (est.)' : ''}`,
    formatMoney(ticketStake(v.ticket, batch), batch.money),
    v.result === 'pending' ? formatMoney(v.potential, pm) : formatMoney(v.profit, pm, true),
    `${STATUS_LABEL[v.status]}${left}`,
  ];
}

/** Every PP of the batch, by number. */
export function batchRows(batch: PPBatch): string[][] {
  const clashing = new Set(sameGameClashes(batch).map((c) => c.ticket.id));
  const repeating = new Set(shotPairRepeats(batch).flatMap((x) => x.numbers));
  return [...batch.tickets].sort((a, b) => a.number - b.number).map((t) => ticketRow(ticketView(t, batch), batch, clashing.has(t.id), repeating.has(t.number)));
}

const title = (batch: PPBatch) => [batch.name, batch.book, formatDate(batch.placedDate)].filter(Boolean).join(' · ');

export function batchTableText(batch: PPBatch): string {
  return [title(batch), COPY_HEADER.join(' | '), ...batchRows(batch).map((r) => r.join(' | '))].join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function batchTableHtml(batch: PPBatch): string {
  const cells = (r: readonly string[], tag: string) => r.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('');
  return `<p><b>${esc(title(batch))}</b></p><table><thead><tr>${cells(COPY_HEADER, 'th')}</tr></thead><tbody>${batchRows(batch)
    .map((r) => `<tr>${cells(r, 'td')}</tr>`)
    .join('')}</tbody></table>`;
}
