import { NextResponse } from 'next/server';
import { getUnitSettings, saveUnitSettings } from '@/lib/server/db';
import { MONEY, type Money } from '@/lib/types';
import { readUnitSizes } from '@/lib/units';

export const dynamic = 'force-dynamic';

/** BT-38: the unit size per money type, and which types were already offered "apply to older bets". */
export async function GET() {
  return NextResponse.json(await getUnitSettings(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { unitSizes?: unknown; offered?: unknown } | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  const raw = (body.unitSizes ?? {}) as Record<string, unknown>;
  for (const m of MONEY) {
    const v = raw[m];
    if (v != null && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) return NextResponse.json({ error: 'A unit size must be above 0' }, { status: 400 });
  }
  const offered = Array.isArray(body.offered) ? (body.offered.filter((m) => MONEY.includes(m as Money)) as Money[]) : [];
  return NextResponse.json(await saveUnitSettings({ unitSizes: readUnitSizes(raw), offered }));
}
