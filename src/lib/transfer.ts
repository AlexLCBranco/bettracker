// Export (JSON with everything, CSV of bets) and the checks an import file must pass. Shared by browser and server.
import { profit } from './money';
import type { Bet, BetInput, Leg } from './types';
import { validateBet } from './validate';
import { validateEntry, type MoneyEntry } from './bankroll';
import { validateBatch, type PPBatch } from './pp';

export const EXPORT_FORMAT = 'bettracker-export';
export const EXPORT_FORMAT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  bets: Bet[];
  /** BT-33: the bankroll's money entries (files from before BT-33 have none). */
  moneyEntries?: MoneyEntry[];
  /** BT-30: PP batches with their legs and tickets (files from before BT-30 have none). */
  ppBatches?: PPBatch[];
}

export function buildExport(bets: Bet[], appVersion: string, exportedAt = new Date().toISOString(), moneyEntries: MoneyEntry[] = [], ppBatches: PPBatch[] = []): ExportFile {
  return { format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, appVersion, exportedAt, bets, moneyEntries, ppBatches };
}

/** A bet ready to insert as it was exported: same ids and timestamps. */
export interface ImportBet {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: BetInput;
  legIds: (string | null)[];
}

export type ParsedImport = { ok: true; bets: ImportBet[]; entries: MoneyEntry[]; batches: PPBatch[] } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const isTimestamp = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Checks a whole file; one bad bet rejects the file (nothing half-imported). */
export function parseImport(raw: unknown, now = new Date().toISOString()): ParsedImport {
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== EXPORT_FORMAT)
    return { ok: false, error: 'This is not a BetTracker export file' };
  const file = raw as { formatVersion?: unknown; bets?: unknown; moneyEntries?: unknown; ppBatches?: unknown };
  if (typeof file.formatVersion !== 'number' || file.formatVersion > EXPORT_FORMAT_VERSION)
    return { ok: false, error: 'This export comes from a newer BetTracker version' };
  if (!Array.isArray(file.bets)) return { ok: false, error: 'The file has no bets list' };

  const out: ImportBet[] = [];
  const seen = new Set<string>();
  for (const [i, b] of file.bets.entries()) {
    const v = validateBet(b);
    if (!v.ok) return { ok: false, error: `Bet ${i + 1}: ${v.error}` };
    const r = b as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : crypto.randomUUID();
    if (seen.has(id)) return { ok: false, error: `Bet ${i + 1}: the id ${id} appears twice` };
    seen.add(id);
    const rawLegs = Array.isArray(r.legs) ? (r.legs as Record<string, unknown>[]) : [];
    out.push({
      id,
      createdAt: isTimestamp(r.createdAt) ? r.createdAt : now,
      updatedAt: isTimestamp(r.updatedAt) ? r.updatedAt : now,
      input: v.value,
      legIds: v.value.legs.map((_, j) => {
        const lid = rawLegs[j]?.id;
        return typeof lid === 'string' && ID.test(lid) ? lid : null;
      }),
    });
  }
  const entries: MoneyEntry[] = [];
  const rawEntries = Array.isArray(file.moneyEntries) ? file.moneyEntries : [];
  for (const [i, e] of rawEntries.entries()) {
    const v = validateEntry(e);
    if (!v.ok) return { ok: false, error: `Money entry ${i + 1}: ${v.error}` };
    const r = e as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : crypto.randomUUID();
    if (entries.some((x) => x.id === id)) return { ok: false, error: `Money entry ${i + 1}: the id ${id} appears twice` };
    entries.push({ ...v.value, id, createdAt: isTimestamp(r.createdAt) ? r.createdAt : now, updatedAt: isTimestamp(r.updatedAt) ? r.updatedAt : now });
  }
  const batches: PPBatch[] = [];
  for (const [i, b] of (Array.isArray(file.ppBatches) ? file.ppBatches : []).entries()) {
    const v = validateBatch(b);
    if (!v.ok) return { ok: false, error: `PP batch ${i + 1}: ${v.error}` };
    const r = b as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : crypto.randomUUID();
    if (batches.some((x) => x.id === id)) return { ok: false, error: `PP batch ${i + 1}: the id ${id} appears twice` };
    batches.push({ ...v.value, id, createdAt: isTimestamp(r.createdAt) ? r.createdAt : now, updatedAt: isTimestamp(r.updatedAt) ? r.updatedAt : now });
  }
  return { ok: true, bets: out, entries, batches };
}

const CSV_COLUMNS = [
  'placed_date', 'game_date', 'book', 'type', 'situation', 'sport', 'game', 'market', 'selection', 'bet_text',
  'stake', 'odds', 'result', 'cashout', 'profit', 'legs', 'pre_analysis', 'post_analysis', 'id', 'dutch_id', 'money', 'label', 'actual', 'rollover_id', 'banked', 'ladder', 'would_have', 'unit_size',
] as const;

function cell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const joinLegs = (legs: Leg[], k: 'sport' | 'game' | 'market' | 'selection' | 'actual') => legs.map((l) => l[k]).filter(Boolean).join(' | ');

/** One row per bet; combination legs joined with " | ". Dates YYYY-MM-DD, dot decimals, UTF-8 with BOM (Excel). */
export function toCSV(bets: Bet[]): string {
  const rows = bets.map((b) =>
    [
      b.placedDate, b.gameDate, b.book, b.type, b.situation,
      joinLegs(b.legs, 'sport'), joinLegs(b.legs, 'game'), joinLegs(b.legs, 'market'), joinLegs(b.legs, 'selection'), b.betText,
      b.stake, b.odds, b.result, b.cashout, b.result === 'pending' ? null : profit(b), b.legs.length, b.preAnalysis, b.postAnalysis, b.id, b.dutchId, b.money, b.label, joinLegs(b.legs, 'actual'), b.rolloverId, b.banked ? 1 : 0, b.ladder ? JSON.stringify(b.ladder) : null, b.wouldHave, b.unitSize,
    ].map(cell).join(','),
  );
  return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
