import { NextResponse } from 'next/server';
import { createBet, listBets } from '@/lib/server/db';
import { validateBet } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await listBets(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const v = validateBet(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json(await createBet(v.value), { status: 201 });
}
