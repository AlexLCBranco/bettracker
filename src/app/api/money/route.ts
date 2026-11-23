import { NextResponse } from 'next/server';
import { validateEntry } from '@/lib/bankroll';
import { createEntry, getEntry, listEntries } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// BT-33: money entries of the bankroll (insert / take out real, bonus and hypothetical money)

export async function GET() {
  return NextResponse.json(await listEntries(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Body: one entry. With `restore: { id, createdAt }` it puts back a deleted entry as it was (undo). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateEntry(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const r = body?.restore as { id?: unknown; createdAt?: unknown } | undefined;
  let restore: { id: string; createdAt: string } | undefined;
  if (r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(r.id) && typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt))) {
    if (await getEntry(r.id)) return NextResponse.json({ error: 'That entry already exists' }, { status: 409 });
    restore = { id: r.id, createdAt: r.createdAt };
  }
  return NextResponse.json(await createEntry(v.value, restore), { status: 201 });
}
