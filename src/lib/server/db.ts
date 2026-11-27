import 'server-only';
import { createClient, type Client, type InStatement, type Row } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MONEY, type Bet, type BetInput, type Leg, type Money } from '../types';
import { readUnitSizes, type UnitSettings } from '../units';
import { readLabelTones, type LabelTones } from '../labelTone';
import type { ImportBet } from '../transfer';
import type { EntryInput, MoneyEntry } from '../bankroll';
import type { BatchInput, PPBatch, PPLeg, PPTicket } from '../pp';
import { asSolo } from '../games';
import { repairLegs } from '../settle';
import type { GameLink } from '../gameLinks';

// Turso (libSQL) in production: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Locally and in tests: a SQLite file,
// data/local.db unless TURSO_DATABASE_URL says otherwise (e.g. file:data/e2e.db).

let client: Client | null = null;
let ready: Promise<void> | null = null;

function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return url;
  if (process.env.VERCEL) throw new Error('TURSO_DATABASE_URL is not set in Vercel environment variables');
  return 'file:data/local.db';
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    book TEXT NOT NULL DEFAULT '',
    placed_date TEXT NOT NULL,
    game_date TEXT NOT NULL,
    type TEXT NOT NULL,
    situation TEXT NOT NULL,
    stake REAL NOT NULL,
    odds REAL NOT NULL,
    result TEXT NOT NULL,
    cashout REAL,
    pre_analysis TEXT NOT NULL DEFAULT '',
    live_analysis TEXT NOT NULL DEFAULT '',
    post_analysis TEXT NOT NULL DEFAULT '',
    bet_text TEXT NOT NULL DEFAULT '',
    dutch_id TEXT,
    money TEXT NOT NULL DEFAULT 'real',
    label TEXT NOT NULL DEFAULT '',
    no_brainer INTEGER NOT NULL DEFAULT 0,
    rollover_id TEXT,
    banked INTEGER NOT NULL DEFAULT 0,
    ladder TEXT,
    would_have TEXT,
    unit_size REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS legs (
    id TEXT PRIMARY KEY,
    bet_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    sport TEXT NOT NULL DEFAULT '',
    game TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    selection TEXT NOT NULL DEFAULT '',
    odds REAL,
    result TEXT NOT NULL DEFAULT 'pending',
    actual TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS legs_bet ON legs (bet_id)`,
  // one-time data passes already run (BT-28)
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // BT-33: money inserted or taken out, per money type and book
  `CREATE TABLE IF NOT EXISTS money_entries (
    id TEXT PRIMARY KEY,
    money TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount REAL NOT NULL,
    book TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    expiry TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // BT-30: PP batches: the batch, its leg pool (each leg once) and its tickets (leg ids as a JSON list)
  `CREATE TABLE IF NOT EXISTS pp_batches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    placed_date TEXT NOT NULL,
    book TEXT NOT NULL DEFAULT '',
    stake REAL NOT NULL,
    target_odds REAL NOT NULL,
    money TEXT NOT NULL DEFAULT 'real',
    scheme TEXT,
    notes TEXT NOT NULL DEFAULT '',
    tiers TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pp_legs (
    id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    sport TEXT NOT NULL DEFAULT '',
    game TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    selection TEXT NOT NULL DEFAULT '',
    odds REAL NOT NULL,
    tier TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT 'pending',
    actual TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (batch_id, id)
  )`,
  // BT-42: a game's page links (one per site), by the game's normalized text and its game date
  `CREATE TABLE IF NOT EXISTS game_links (
    game TEXT NOT NULL,
    game_date TEXT NOT NULL,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (game, game_date, site)
  )`,
  `CREATE TABLE IF NOT EXISTS pp_tickets (
    id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    leg_ids TEXT NOT NULL,
    placed INTEGER NOT NULL DEFAULT 1,
    odds_override REAL,
    stake REAL,
    PRIMARY KEY (batch_id, id)
  )`,
];

export async function db(): Promise<Client> {
  if (!client) {
    const url = databaseUrl();
    if (url.startsWith('file:')) mkdirSync(dirname(url.slice(5)) || '.', { recursive: true });
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  ready ??= migrate(client);
  await ready;
  return client;
}

/** Creates the tables, then adds columns that databases created by older versions lack. */
async function migrate(c: Client): Promise<void> {
  await c.batch(SCHEMA, 'write');
  const cols = new Set((await c.execute('PRAGMA table_info(bets)')).rows.map((r) => String(r.name)));
  if (!cols.has('dutch_id')) await c.execute('ALTER TABLE bets ADD COLUMN dutch_id TEXT');
  if (!cols.has('money')) await c.execute("ALTER TABLE bets ADD COLUMN money TEXT NOT NULL DEFAULT 'real'");
  // BT-27: existing bets get no label and no actual results
  if (!cols.has('label')) await c.execute("ALTER TABLE bets ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  // BT-29: existing bets are in no rollover and not banked
  if (!cols.has('rollover_id')) await c.execute('ALTER TABLE bets ADD COLUMN rollover_id TEXT');
  if (!cols.has('banked')) await c.execute('ALTER TABLE bets ADD COLUMN banked INTEGER NOT NULL DEFAULT 0');
  // BT-35: existing bets are no ladder (existing chains are shots)
  if (!cols.has('ladder')) await c.execute('ALTER TABLE bets ADD COLUMN ladder TEXT');
  // BT-37: existing cash-outs have no would-have set
  if (!cols.has('would_have')) await c.execute('ALTER TABLE bets ADD COLUMN would_have TEXT');
  // BT-38: existing bets were placed before any unit size
  if (!cols.has('unit_size')) await c.execute('ALTER TABLE bets ADD COLUMN unit_size REAL');
  // BT-44: existing bets are not no brainers
  // BT-52: the Live note (Pre and Post stay in pre_analysis / post_analysis, BT-47's Before / After)
  if (!cols.has('live_analysis')) await c.execute("ALTER TABLE bets ADD COLUMN live_analysis TEXT NOT NULL DEFAULT ''");
  if (!cols.has('no_brainer')) await c.execute('ALTER TABLE bets ADD COLUMN no_brainer INTEGER NOT NULL DEFAULT 0');
  const legCols = new Set((await c.execute('PRAGMA table_info(legs)')).rows.map((r) => String(r.name)));
  if (!legCols.has('actual')) await c.execute("ALTER TABLE legs ADD COLUMN actual TEXT NOT NULL DEFAULT ''");
  // existing PPs have no stake of their own: they keep the batch's
  const ppCols = new Set((await c.execute('PRAGMA table_info(pp_tickets)')).rows.map((r) => String(r.name)));
  if (!ppCols.has('stake')) await c.execute('ALTER TABLE pp_tickets ADD COLUMN stake REAL');
  await repairLegsOnce(c);
}

/** BT-28 rule 5: settled combinations logged before BT-28 get the leg results their bet implies, once. */
async function repairLegsOnce(c: Client): Promise<void> {
  const done = await c.execute({ sql: 'SELECT 1 FROM meta WHERE key = ?', args: ['bt28-legs'] });
  if (done.rows.length) return;
  const fixes = repairLegs(await readBets(c));
  await c.batch(
    [
      ...fixes.flatMap((f) => f.legs.map((l, i) => ({ sql: 'UPDATE legs SET result = ? WHERE bet_id = ? AND position = ?', args: [l.result, f.id, i] }))),
      { sql: 'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', args: ['bt28-legs', new Date().toISOString()] },
    ],
    'write',
  );
}

const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/** BT-25: a legless "combination" saved before it was detected reads as the solo it is (asSolo). */
function rowToBet(r: Row, legs: Leg[]): Bet {
  return asSolo({
    id: s(r.id),
    book: s(r.book),
    placedDate: s(r.placed_date),
    gameDate: s(r.game_date),
    type: s(r.type) as Bet['type'],
    situation: s(r.situation) as Bet['situation'],
    stake: Number(r.stake),
    odds: Number(r.odds),
    result: s(r.result) as Bet['result'],
    cashout: n(r.cashout),
    preAnalysis: s(r.pre_analysis),
    liveAnalysis: s(r.live_analysis),
    postAnalysis: s(r.post_analysis),
    betText: s(r.bet_text),
    legs,
    dutchId: r.dutch_id == null || r.dutch_id === '' ? null : s(r.dutch_id),
    money: r.money === 'hypothetical' || r.money === 'bonus' ? r.money : 'real',
    label: s(r.label),
    noBrainer: Number(r.no_brainer ?? 0) === 1,
    rolloverId: r.rollover_id == null || r.rollover_id === '' ? null : s(r.rollover_id),
    banked: Number(r.banked ?? 0) === 1,
    ladder: readLadder(r.ladder),
    wouldHave: r.would_have === 'won' || r.would_have === 'lost' ? r.would_have : null,
    unitSize: r.unit_size == null ? null : Number(r.unit_size),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  });
}

function readLadder(v: unknown): Bet['ladder'] {
  if (v == null || v === '') return null;
  try {
    const o = JSON.parse(String(v)) as Partial<NonNullable<Bet['ladder']>>;
    return { goalRungs: typeof o.goalRungs === 'number' ? o.goalRungs : null, goalAmount: typeof o.goalAmount === 'number' ? o.goalAmount : null, taken: o.taken === true };
  } catch {
    return null;
  }
}

function rowToLeg(r: Row): Leg {
  return {
    id: s(r.id),
    sport: s(r.sport),
    game: s(r.game),
    market: s(r.market),
    selection: s(r.selection),
    odds: n(r.odds),
    result: s(r.result) as Leg['result'],
    actual: s(r.actual),
  };
}

export async function listBets(): Promise<Bet[]> {
  return readBets(await db());
}

async function readBets(c: Client): Promise<Bet[]> {
  const [bets, legs] = await c.batch(['SELECT * FROM bets ORDER BY placed_date DESC, created_at DESC', 'SELECT * FROM legs ORDER BY bet_id, position'], 'read');
  const byBet = new Map<string, Leg[]>();
  for (const r of legs!.rows) {
    const id = s(r.bet_id);
    if (!byBet.has(id)) byBet.set(id, []);
    byBet.get(id)!.push(rowToLeg(r));
  }
  return bets!.rows.map((r) => rowToBet(r, byBet.get(s(r.id)) ?? []));
}

export async function getBet(id: string): Promise<Bet | null> {
  const c = await db();
  const [b, l] = await c.batch(
    [
      { sql: 'SELECT * FROM bets WHERE id = ?', args: [id] },
      { sql: 'SELECT * FROM legs WHERE bet_id = ? ORDER BY position', args: [id] },
    ],
    'read',
  );
  const row = b!.rows[0];
  return row ? rowToBet(row, l!.rows.map(rowToLeg)) : null;
}

function writeStatements(bet: Bet): InStatement[] {
  return [
    {
      sql: `INSERT OR REPLACE INTO bets (id, book, placed_date, game_date, type, situation, stake, odds, result, cashout,
            pre_analysis, live_analysis, post_analysis, bet_text, dutch_id, money, label, rollover_id, banked, ladder, would_have, unit_size, no_brainer, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [bet.id, bet.book, bet.placedDate, bet.gameDate, bet.type, bet.situation, bet.stake, bet.odds, bet.result, bet.cashout,
        bet.preAnalysis, bet.liveAnalysis ?? '', bet.postAnalysis, bet.betText, bet.dutchId, bet.money, bet.label, bet.rolloverId, bet.banked ? 1 : 0, bet.ladder ? JSON.stringify(bet.ladder) : null, bet.wouldHave ?? null, bet.unitSize ?? null, bet.noBrainer ? 1 : 0, bet.createdAt, bet.updatedAt],
    },
    { sql: 'DELETE FROM legs WHERE bet_id = ?', args: [bet.id] },
    ...bet.legs.map((l, i) => ({
      sql: 'INSERT INTO legs (id, bet_id, position, sport, game, market, selection, odds, result, actual) VALUES (?,?,?,?,?,?,?,?,?,?)',
      args: [l.id, bet.id, i, l.sport, l.game, l.market, l.selection, l.odds, l.result, l.actual],
    })),
  ];
}

const withLegIds = (legs: BetInput['legs'], existing: Leg[] = []): Leg[] =>
  legs.map((l, i) => ({ ...l, id: existing[i]?.id ?? crypto.randomUUID() }));

export async function createBet(input: BetInput): Promise<Bet> {
  return (await createBets([input]))[0]!;
}

/** Creates several bets in one batch (all or none). Timestamps step by 1 ms so they keep the order given. */
export async function createBets(inputs: BetInput[]): Promise<Bet[]> {
  const t = Date.now();
  const bets: Bet[] = inputs.map((input, i) => {
    const at = new Date(t + i).toISOString();
    return { ...input, id: crypto.randomUUID(), legs: withLegIds(input.legs), createdAt: at, updatedAt: at };
  });
  await (await db()).batch(bets.flatMap(writeStatements), 'write');
  return bets;
}

const COLUMNS = {
  book: 'book', placedDate: 'placed_date', gameDate: 'game_date', type: 'type', situation: 'situation', stake: 'stake',
  odds: 'odds', result: 'result', cashout: 'cashout', preAnalysis: 'pre_analysis', liveAnalysis: 'live_analysis', postAnalysis: 'post_analysis', betText: 'bet_text', dutchId: 'dutch_id', money: 'money', label: 'label', rolloverId: 'rollover_id', banked: 'banked', ladder: 'ladder', wouldHave: 'would_have', unitSize: 'unit_size', noBrainer: 'no_brainer',
} as const satisfies Partial<Record<keyof Bet, string>>;

const sameLegs = (a: BetInput['legs'], b: Leg[]) =>
  a.length === b.length && a.every((l, i) => (['sport', 'game', 'market', 'selection', 'odds', 'result', 'actual'] as const).every((k) => l[k] === b[i]![k]));

/**
 * Writes only what differs from `existing` (the bet as the caller read it), then returns the bet as stored.
 * Two overlapping edits of different fields (inline edit, then Mark Won a moment later) both read the old bet;
 * writing every column would let the second put the first one's field back.
 */
export async function updateBet(existing: Bet, input: BetInput): Promise<Bet> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    // BT-35: the ladder is an object, stored as JSON
    const a = key === 'ladder' ? (input.ladder ? JSON.stringify(input.ladder) : null) : input[key];
    const b = key === 'ladder' ? (existing.ladder ? JSON.stringify(existing.ladder) : null) : existing[key];
    if (a !== b) {
      sets.push(`${col} = ?`);
      args.push(typeof a === 'boolean' ? (a ? 1 : 0) : (a as string | number | null));
    }
  }
  const legsChanged = !sameLegs(input.legs, existing.legs);
  if (sets.length || legsChanged) {
    const legs = withLegIds(input.legs, existing.legs);
    await (await db()).batch(
      [
        { sql: `UPDATE bets SET ${[...sets, 'updated_at = ?'].join(', ')} WHERE id = ?`, args: [...args, new Date().toISOString(), existing.id] },
        ...(legsChanged
          ? [
              { sql: 'DELETE FROM legs WHERE bet_id = ?', args: [existing.id] },
              ...legs.map((l, i) => ({
                sql: 'INSERT INTO legs (id, bet_id, position, sport, game, market, selection, odds, result, actual) VALUES (?,?,?,?,?,?,?,?,?,?)',
                args: [l.id, existing.id, i, l.sport, l.game, l.market, l.selection, l.odds, l.result, l.actual],
              })),
            ]
          : []),
      ],
      'write',
    );
  }
  return (await getBet(existing.id)) ?? { ...input, id: existing.id, legs: withLegIds(input.legs, existing.legs), createdAt: existing.createdAt, updatedAt: existing.updatedAt };
}

/**
 * Adds imported bets with their original ids and timestamps. Bets whose id is already in the database are
 * skipped, never overwritten. Everything is written in one batch: all of it lands or none of it.
 */
export async function importBets(items: ImportBet[]): Promise<{ added: number; skipped: number }> {
  const c = await db();
  const existing = new Set((await c.execute('SELECT id FROM bets')).rows.map((r) => s(r.id)));
  const fresh = items.filter((b) => !existing.has(b.id));
  if (fresh.length) {
    const statements = fresh.flatMap((b) =>
      writeStatements({
        ...b.input,
        id: b.id,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        legs: b.input.legs.map((l, i) => ({ ...l, id: b.legIds[i] ?? crypto.randomUUID() })),
      }),
    );
    await c.batch(statements, 'write');
  }
  return { added: fresh.length, skipped: items.length - fresh.length };
}

/** Deletes every bet of a dutch; returns how many. */
export async function deleteDutch(dutchId: string): Promise<number> {
  const [, r] = await (await db()).batch(
    [
      { sql: 'DELETE FROM legs WHERE bet_id IN (SELECT id FROM bets WHERE dutch_id = ?)', args: [dutchId] },
      { sql: 'DELETE FROM bets WHERE dutch_id = ?', args: [dutchId] },
    ],
    'write',
  );
  return r?.rowsAffected ?? 0;
}

export async function deleteBet(id: string): Promise<boolean> {
  const [r] = await (await db()).batch(
    [
      { sql: 'DELETE FROM bets WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM legs WHERE bet_id = ?', args: [id] },
    ],
    'write',
  );
  return (r?.rowsAffected ?? 0) > 0;
}

// BT-33: money entries (bankroll)

function rowToEntry(r: Row): MoneyEntry {
  return {
    id: s(r.id),
    money: s(r.money) as MoneyEntry['money'],
    direction: r.direction === 'out' ? 'out' : 'in',
    amount: Number(r.amount),
    book: s(r.book),
    date: s(r.date),
    note: s(r.note),
    expiry: r.expiry == null || r.expiry === '' ? null : s(r.expiry),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export async function listEntries(): Promise<MoneyEntry[]> {
  const r = await (await db()).execute('SELECT * FROM money_entries ORDER BY date DESC, created_at DESC');
  return r.rows.map(rowToEntry);
}

const entryWrite = (e: MoneyEntry): InStatement => ({
  sql: 'INSERT OR REPLACE INTO money_entries (id, money, direction, amount, book, date, note, expiry, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  args: [e.id, e.money, e.direction, e.amount, e.book, e.date, e.note, e.expiry, e.createdAt, e.updatedAt],
});

/** Creates an entry; `restore` puts back a deleted one with its id and timestamps (undo). */
export async function createEntry(input: EntryInput, restore?: { id: string; createdAt: string }): Promise<MoneyEntry> {
  const at = new Date().toISOString();
  const e: MoneyEntry = { ...input, id: restore?.id ?? crypto.randomUUID(), createdAt: restore?.createdAt ?? at, updatedAt: at };
  await (await db()).execute(entryWrite(e));
  return e;
}

export async function getEntry(id: string): Promise<MoneyEntry | null> {
  const r = await (await db()).execute({ sql: 'SELECT * FROM money_entries WHERE id = ?', args: [id] });
  return r.rows[0] ? rowToEntry(r.rows[0]) : null;
}

export async function updateEntry(existing: MoneyEntry, input: EntryInput): Promise<MoneyEntry> {
  const e: MoneyEntry = { ...existing, ...input, updatedAt: new Date().toISOString() };
  await (await db()).execute(entryWrite(e));
  return e;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const r = await (await db()).execute({ sql: 'DELETE FROM money_entries WHERE id = ?', args: [id] });
  return r.rowsAffected > 0;
}

/** Import: entries whose id is not there yet (never overwritten). */
export async function importEntries(items: MoneyEntry[]): Promise<{ added: number; skipped: number }> {
  const c = await db();
  const existing = new Set((await c.execute('SELECT id FROM money_entries')).rows.map((r) => s(r.id)));
  const fresh = items.filter((e) => !existing.has(e.id));
  if (fresh.length) await c.batch(fresh.map(entryWrite), 'write');
  return { added: fresh.length, skipped: items.length - fresh.length };
}

// BT-30: PP batches. A batch is written as a whole (its legs and tickets replaced); a leg's result, actual and note can
// be changed on their own (settling ~30 legs one by one).

function parseJSON<T>(v: unknown, fallback: T): T {
  try {
    return v == null || v === '' ? fallback : (JSON.parse(String(v)) as T);
  } catch {
    return fallback;
  }
}

export async function listBatches(): Promise<PPBatch[]> {
  return readBatches(await db());
}

async function readBatches(c: Client, id?: string): Promise<PPBatch[]> {
  const where = id ? ' WHERE batch_id = ?' : '';
  const args = id ? [id] : [];
  const [b, l, t] = await c.batch(
    [
      { sql: `SELECT * FROM pp_batches${id ? ' WHERE id = ?' : ''} ORDER BY placed_date DESC, created_at DESC`, args },
      { sql: `SELECT * FROM pp_legs${where} ORDER BY batch_id, position`, args },
      { sql: `SELECT * FROM pp_tickets${where} ORDER BY batch_id, number`, args },
    ],
    'read',
  );
  const legs = new Map<string, PPLeg[]>();
  for (const r of l!.rows) {
    const k = s(r.batch_id);
    if (!legs.has(k)) legs.set(k, []);
    legs.get(k)!.push({ id: s(r.id), sport: s(r.sport), game: s(r.game), market: s(r.market), selection: s(r.selection), odds: Number(r.odds), tier: s(r.tier), result: s(r.result) as PPLeg['result'], actual: s(r.actual), note: s(r.note) });
  }
  const tickets = new Map<string, PPTicket[]>();
  for (const r of t!.rows) {
    const k = s(r.batch_id);
    if (!tickets.has(k)) tickets.set(k, []);
    tickets.get(k)!.push({ id: s(r.id), number: Number(r.number), legIds: parseJSON<string[]>(r.leg_ids, []), placed: Number(r.placed) === 1, oddsOverride: n(r.odds_override), stake: n(r.stake) });
  }
  return b!.rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    placedDate: s(r.placed_date),
    book: s(r.book),
    stake: Number(r.stake),
    targetOdds: Number(r.target_odds),
    money: r.money === 'bonus' || r.money === 'hypothetical' ? r.money : 'real',
    scheme: parseJSON<Record<string, unknown> | null>(r.scheme, null),
    notes: s(r.notes),
    tiers: parseJSON(r.tiers, []),
    legs: legs.get(s(r.id)) ?? [],
    tickets: tickets.get(s(r.id)) ?? [],
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  }));
}

export async function getBatch(id: string): Promise<PPBatch | null> {
  return (await readBatches(await db(), id))[0] ?? null;
}

function batchStatements(b: PPBatch): InStatement[] {
  return [
    {
      sql: 'INSERT OR REPLACE INTO pp_batches (id, name, placed_date, book, stake, target_odds, money, scheme, notes, tiers, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [b.id, b.name, b.placedDate, b.book, b.stake, b.targetOdds, b.money, b.scheme ? JSON.stringify(b.scheme) : null, b.notes, JSON.stringify(b.tiers), b.createdAt, b.updatedAt],
    },
    { sql: 'DELETE FROM pp_legs WHERE batch_id = ?', args: [b.id] },
    { sql: 'DELETE FROM pp_tickets WHERE batch_id = ?', args: [b.id] },
    ...b.legs.map((l, i) => ({
      sql: 'INSERT INTO pp_legs (id, batch_id, position, sport, game, market, selection, odds, tier, result, actual, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [l.id, b.id, i, l.sport, l.game, l.market, l.selection, l.odds, l.tier, l.result, l.actual, l.note],
    })),
    ...b.tickets.map((t) => ({
      sql: 'INSERT INTO pp_tickets (id, batch_id, number, leg_ids, placed, odds_override, stake) VALUES (?,?,?,?,?,?,?)',
      args: [t.id, b.id, t.number, JSON.stringify(t.legIds), t.placed ? 1 : 0, t.oddsOverride, t.stake],
    })),
  ];
}

/** Creates a batch (`id` given: with that id, as an import or an undo does) or replaces it as a whole. */
export async function saveBatch(input: BatchInput, id?: string, createdAt?: string): Promise<PPBatch> {
  const c = await db();
  const existing = id ? await getBatch(id) : null;
  const at = new Date().toISOString();
  const b: PPBatch = { ...input, id: id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? createdAt ?? at, updatedAt: at };
  await c.batch(batchStatements(b), 'write');
  return b;
}

/** Changes one leg's result, actual or note. */
export async function patchLeg(batchId: string, legId: string, patch: Partial<Pick<PPLeg, 'result' | 'actual' | 'note'>>): Promise<boolean> {
  const sets: string[] = [];
  const args: string[] = [];
  for (const k of ['result', 'actual', 'note'] as const) {
    if (patch[k] == null) continue;
    sets.push(`${k} = ?`);
    args.push(patch[k]!);
  }
  const c = await db();
  if (!sets.length) return (await c.execute({ sql: 'SELECT 1 FROM pp_legs WHERE batch_id = ? AND id = ?', args: [batchId, legId] })).rows.length > 0;
  const [r] = await c.batch(
    [
      { sql: `UPDATE pp_legs SET ${sets.join(', ')} WHERE batch_id = ? AND id = ?`, args: [...args, batchId, legId] },
      { sql: 'UPDATE pp_batches SET updated_at = ? WHERE id = ?', args: [new Date().toISOString(), batchId] },
    ],
    'write',
  );
  return (r?.rowsAffected ?? 0) > 0;
}

export async function deleteBatch(id: string): Promise<boolean> {
  const [r] = await (await db()).batch(
    [
      { sql: 'DELETE FROM pp_batches WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM pp_legs WHERE batch_id = ?', args: [id] },
      { sql: 'DELETE FROM pp_tickets WHERE batch_id = ?', args: [id] },
    ],
    'write',
  );
  return (r?.rowsAffected ?? 0) > 0;
}

/** Import: batches whose id is not there yet (never overwritten). */
export async function importBatches(items: PPBatch[]): Promise<{ added: number; skipped: number }> {
  const c = await db();
  const existing = new Set((await c.execute('SELECT id FROM pp_batches')).rows.map((r) => s(r.id)));
  const fresh = items.filter((b) => !existing.has(b.id));
  if (fresh.length) await c.batch(fresh.flatMap(batchStatements), 'write');
  return { added: fresh.length, skipped: items.length - fresh.length };
}

// ---- BT-38: unit sizes (one per money type) and the one-time offer to apply the first one to older bets ----


const metaJSON = async (c: Client, key: string): Promise<unknown> => {
  const r = await c.execute({ sql: 'SELECT value FROM meta WHERE key = ?', args: [key] });
  if (!r.rows.length) return null;
  try {
    return JSON.parse(String(r.rows[0]!.value));
  } catch {
    return null;
  }
};

export async function getUnitSettings(): Promise<UnitSettings> {
  const c = await db();
  const offered = await metaJSON(c, 'unit-offered');
  return { unitSizes: readUnitSizes(await metaJSON(c, 'unit-sizes')), offered: Array.isArray(offered) ? MONEY.filter((m) => offered.includes(m)) : [] };
}

export async function saveUnitSettings(s: UnitSettings): Promise<UnitSettings> {
  const c = await db();
  const clean: UnitSettings = { unitSizes: readUnitSizes(s.unitSizes), offered: MONEY.filter((m) => s.offered.includes(m)) };
  await c.batch(
    [
      { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', args: ['unit-sizes', JSON.stringify(clean.unitSizes)] },
      { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', args: ['unit-offered', JSON.stringify(clean.offered)] },
    ],
    'write',
  );
  return clean;
}

// ---- label tones (2026-11-27): which labels are positive (green) or neutral (grey); every other one is red ----

export async function getLabelTones(): Promise<LabelTones> {
  return readLabelTones(await metaJSON(await db(), 'label-tones'));
}

export async function saveLabelTones(tones: unknown): Promise<LabelTones> {
  const clean = readLabelTones(tones);
  await (await db()).execute({ sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', args: ['label-tones', JSON.stringify(clean)] });
  return clean;
}

/** Gives every bet of a money type that has no unit size this one; returns how many changed. */
export async function applyUnitSize(money: Money, unitSize: number): Promise<number> {
  const r = await (await db()).execute({ sql: 'UPDATE bets SET unit_size = ?, updated_at = ? WHERE money = ? AND unit_size IS NULL', args: [unitSize, new Date().toISOString(), money] });
  return r.rowsAffected;
}

// ---- BT-42: game page links ----

export async function listGameLinks(): Promise<GameLink[]> {
  const r = await (await db()).execute('SELECT game, game_date, site, url FROM game_links ORDER BY created_at');
  return r.rows.map((x) => ({ game: s(x.game), date: s(x.game_date), site: s(x.site), url: s(x.url) }));
}

export async function saveGameLink(l: GameLink): Promise<GameLink> {
  await (await db()).execute({
    sql: 'INSERT OR REPLACE INTO game_links (game, game_date, site, url, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [l.game, l.date, l.site, l.url, new Date().toISOString()],
  });
  return l;
}

export async function deleteGameLink(l: Pick<GameLink, 'game' | 'date' | 'site'>): Promise<boolean> {
  const r = await (await db()).execute({ sql: 'DELETE FROM game_links WHERE game = ? AND game_date = ? AND site = ?', args: [l.game, l.date, l.site] });
  return r.rowsAffected > 0;
}
