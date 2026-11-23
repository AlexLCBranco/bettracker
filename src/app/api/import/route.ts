import { NextResponse } from 'next/server';
import { importBets, importEntries } from '@/lib/server/db';
import { parseImport } from '@/lib/transfer';

export const dynamic = 'force-dynamic';

/** Body: a BetTracker JSON export. Adds the bets (and money entries) that aren't in the database yet; never overwrites or deletes. */
export async function POST(request: Request) {
  const parsed = parseImport(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const bets = await importBets(parsed.bets);
  // BT-33: the bankroll's entries come along (added the same way: only ids not already here)
  const entries = await importEntries(parsed.entries);
  return NextResponse.json({ ...bets, entries });
}
