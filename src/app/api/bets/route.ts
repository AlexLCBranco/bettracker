import { NextResponse } from 'next/server';
import { createBets, listBets } from '@/lib/server/db';
import type { BetInput } from '@/lib/types';
import { validateBet } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await listBets(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Body: one bet, or a list of bets to create together (all or none), e.g. the bets of a dutch. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const many = Array.isArray(body);
  const raw = many ? body : [body];
  if (!raw.length || raw.length > 50) return NextResponse.json({ error: 'Send 1 to 50 bets' }, { status: 400 });
  const inputs: BetInput[] = [];
  for (const [i, b] of raw.entries()) {
    const v = validateBet(b);
    if (!v.ok) return NextResponse.json({ error: many ? `Bet ${i + 1}: ${v.error}` : v.error }, { status: 400 });
    inputs.push(v.value);
  }
  const created = await createBets(inputs);
  return NextResponse.json(many ? created : created[0], { status: 201 });
}
