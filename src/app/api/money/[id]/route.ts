import { NextResponse, type NextRequest } from 'next/server';
import { validateEntry } from '@/lib/bankroll';
import { deleteEntry, getEntry, updateEntry } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Partial update: the given fields are merged into the entry, then the whole entry is validated again. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/money/[id]'>) {
  const { id } = await ctx.params;
  const existing = await getEntry(id);
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  const patch = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch || typeof patch !== 'object') return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  const v = validateEntry({ ...existing, ...patch });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json(await updateEntry(existing, v.value));
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/money/[id]'>) {
  const { id } = await ctx.params;
  if (!(await deleteEntry(id))) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
