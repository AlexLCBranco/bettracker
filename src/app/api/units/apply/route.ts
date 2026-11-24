import { NextResponse } from 'next/server';
import { applyUnitSize, getUnitSettings } from '@/lib/server/db';
import { MONEY, type Money } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** BT-38: gives the older bets of a money type (no unit size yet) that type's current unit size. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { money?: unknown } | null;
  const money = body?.money as Money;
  if (!MONEY.includes(money)) return NextResponse.json({ error: 'Money must be real, bonus or hypothetical' }, { status: 400 });
  const size = (await getUnitSettings()).unitSizes[money];
  if (!size) return NextResponse.json({ error: 'Set a unit size first' }, { status: 400 });
  return NextResponse.json({ updated: await applyUnitSize(money, size) });
}
