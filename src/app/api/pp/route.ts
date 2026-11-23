import { NextResponse } from 'next/server';
import { validateBatch } from '@/lib/pp';
import { getBatch, listBatches, saveBatch } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// BT-30: PP batches (leg pool + tickets), kept apart from bets.

export async function GET() {
  return NextResponse.json(await listBatches(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Body: a whole batch. With `restore: { id, createdAt }` it puts back a deleted batch as it was (undo). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateBatch(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const r = body?.restore as { id?: unknown; createdAt?: unknown } | undefined;
  if (r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(r.id) && typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt))) {
    if (await getBatch(r.id)) return NextResponse.json({ error: 'That batch already exists' }, { status: 409 });
    return NextResponse.json(await saveBatch(v.value, r.id, r.createdAt), { status: 201 });
  }
  return NextResponse.json(await saveBatch(v.value), { status: 201 });
}
