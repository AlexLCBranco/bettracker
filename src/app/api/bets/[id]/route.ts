import { NextResponse, type NextRequest } from 'next/server';
import { deleteBet, getBet, updateBet } from '@/lib/server/db';
import { validateBet } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/** Partial update: the given fields are merged into the bet, then the whole bet is validated again. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/bets/[id]'>) {
  const { id } = await ctx.params;
  const existing = await getBet(id);
  if (!existing) return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
  const patch = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch || typeof patch !== 'object') return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  const v = validateBet({ ...existing, ...patch });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json(await updateBet(existing, v.value));
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/bets/[id]'>) {
  const { id } = await ctx.params;
  if (!(await deleteBet(id))) return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
