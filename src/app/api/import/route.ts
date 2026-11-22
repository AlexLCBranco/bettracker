import { NextResponse } from 'next/server';
import { importBets } from '@/lib/server/db';
import { parseImport } from '@/lib/transfer';

export const dynamic = 'force-dynamic';

/** Body: a BetTracker JSON export. Adds the bets that aren't in the database yet; never overwrites or deletes. */
export async function POST(request: Request) {
  const parsed = parseImport(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json(await importBets(parsed.bets));
}
