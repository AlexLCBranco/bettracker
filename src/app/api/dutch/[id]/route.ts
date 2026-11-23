import { NextResponse, type NextRequest } from 'next/server';
import { deleteDutch } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Deletes every bet of a dutch. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/dutch/[id]'>) {
  const { id } = await ctx.params;
  const deleted = await deleteDutch(id);
  if (!deleted) return NextResponse.json({ error: 'Dutch not found' }, { status: 404 });
  return NextResponse.json({ ok: true, deleted });
}
