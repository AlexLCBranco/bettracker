import { NextResponse, type NextRequest } from 'next/server';
import { PP_LEG_RESULTS, type PPLegResult } from '@/lib/pp';
import { patchLeg } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Settles one leg (result), or sets its actual or note; every ticket with it follows (derived on read). */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/pp/[id]/legs/[legId]'>) {
  const { id, legId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  const patch: { result?: PPLegResult; actual?: string; note?: string } = {};
  if (body.result != null) {
    if (!PP_LEG_RESULTS.includes(body.result as PPLegResult)) return NextResponse.json({ error: 'Result must be pending, won, lost or void' }, { status: 400 });
    patch.result = body.result as PPLegResult;
  }
  if (body.actual != null) patch.actual = String(body.actual).trim().slice(0, 200);
  if (body.note != null) patch.note = String(body.note).trim().slice(0, 300);
  if (!(await patchLeg(id, legId, patch))) return NextResponse.json({ error: 'Leg not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
