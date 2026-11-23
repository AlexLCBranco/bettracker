import { NextResponse, type NextRequest } from 'next/server';
import { validateBatch } from '@/lib/pp';
import { deleteBatch, getBatch, saveBatch } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Replaces the batch as a whole (fields, tiers, legs, tickets). */
export async function PUT(request: NextRequest, ctx: RouteContext<'/api/pp/[id]'>) {
  const { id } = await ctx.params;
  if (!(await getBatch(id))) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  const v = validateBatch(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json(await saveBatch(v.value, id));
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/pp/[id]'>) {
  const { id } = await ctx.params;
  if (!(await deleteBatch(id))) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
