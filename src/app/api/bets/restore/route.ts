import { NextResponse } from 'next/server';
import { getBet, importBets } from '@/lib/server/db';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, parseImport } from '@/lib/transfer';
import type { Bet } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Body: deleted bets as they were (ids, timestamps and leg ids included). Puts them back (undo of a delete); a bet
 * whose id is already here is left as it is. Returns the bets as stored.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!Array.isArray(body) || !body.length || body.length > 200) return NextResponse.json({ error: 'Send 1 to 200 bets' }, { status: 400 });
  const parsed = parseImport({ format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, bets: body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await importBets(parsed.bets);
  const back = (await Promise.all(parsed.bets.map((b) => getBet(b.id)))).filter((b): b is Bet => !!b);
  return NextResponse.json(back, { status: 201 });
}
