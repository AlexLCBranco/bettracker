import { NextResponse } from 'next/server';
import { getLabelTones, saveLabelTones } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Label tones: { "<label key>": "positive" | "neutral" } for the green / grey labels; every other label is red. */
export async function GET() {
  return NextResponse.json(await getLabelTones(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  return NextResponse.json(await saveLabelTones(body));
}
