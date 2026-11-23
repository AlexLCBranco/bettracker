import 'server-only';
import { createClient, type Client, type InStatement, type Row } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Bet, BetInput, Leg } from '../types';
import type { ImportBet } from '../transfer';
import { asSolo } from '../games';

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
    post_analysis TEXT NOT NULL DEFAULT '',
    bet_text TEXT NOT NULL DEFAULT '',
    dutch_id TEXT,
    money TEXT NOT NULL DEFAULT 'real',
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
    result TEXT NOT NULL DEFAULT 'pending'
  )`,
  `CREATE INDEX IF NOT EXISTS legs_bet ON legs (bet_id)`,
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
    postAnalysis: s(r.post_analysis),
    betText: s(r.bet_text),
    legs,
    dutchId: r.dutch_id == null || r.dutch_id === '' ? null : s(r.dutch_id),
    money: r.money === 'hypothetical' ? 'hypothetical' : 'real',
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  });
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
  };
}

export async function listBets(): Promise<Bet[]> {
  const c = await db();
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
            pre_analysis, post_analysis, bet_text, dutch_id, money, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [bet.id, bet.book, bet.placedDate, bet.gameDate, bet.type, bet.situation, bet.stake, bet.odds, bet.result, bet.cashout,
        bet.preAnalysis, bet.postAnalysis, bet.betText, bet.dutchId, bet.money, bet.createdAt, bet.updatedAt],
    },
    { sql: 'DELETE FROM legs WHERE bet_id = ?', args: [bet.id] },
    ...bet.legs.map((l, i) => ({
      sql: 'INSERT INTO legs (id, bet_id, position, sport, game, market, selection, odds, result) VALUES (?,?,?,?,?,?,?,?,?)',
      args: [l.id, bet.id, i, l.sport, l.game, l.market, l.selection, l.odds, l.result],
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
  odds: 'odds', result: 'result', cashout: 'cashout', preAnalysis: 'pre_analysis', postAnalysis: 'post_analysis', betText: 'bet_text', dutchId: 'dutch_id', money: 'money',
} as const satisfies Partial<Record<keyof Bet, string>>;

const sameLegs = (a: BetInput['legs'], b: Leg[]) =>
  a.length === b.length && a.every((l, i) => (['sport', 'game', 'market', 'selection', 'odds', 'result'] as const).every((k) => l[k] === b[i]![k]));

/**
 * Writes only what differs from `existing` (the bet as the caller read it), then returns the bet as stored.
 * Two overlapping edits of different fields (inline edit, then Mark Won a moment later) both read the old bet;
 * writing every column would let the second put the first one's field back.
 */
export async function updateBet(existing: Bet, input: BetInput): Promise<Bet> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    if (input[key] !== existing[key]) {
      sets.push(`${col} = ?`);
      args.push(input[key]);
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
                sql: 'INSERT INTO legs (id, bet_id, position, sport, game, market, selection, odds, result) VALUES (?,?,?,?,?,?,?,?,?)',
                args: [l.id, existing.id, i, l.sport, l.game, l.market, l.selection, l.odds, l.result],
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
