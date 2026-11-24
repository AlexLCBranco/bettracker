import { NextResponse } from 'next/server';
import { addLink, gameKey, linksFor } from '@/lib/gameLinks';
import { isValidISODate } from '@/lib/dates';
import { deleteGameLink, listGameLinks, saveGameLink } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// BT-42: a game's page links on Hoops Junkie / Sofascore (or another site), pasted once per game.

export async function GET() {
  return NextResponse.json(await listGameLinks(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Body: { game, date, url }. The site comes from the address; a site's old link for that game is replaced. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { game?: unknown; date?: unknown; url?: unknown } | null;
  if (!body || typeof body.game !== 'string' || typeof body.url !== 'string' || typeof body.date !== 'string' || !isValidISODate(body.date))
    return NextResponse.json({ error: 'Body must be { game, date: "YYYY-MM-DD", url }' }, { status: 400 });
  const all = await listGameLinks();
  const r = addLink(linksFor(all, body.game, body.date), body.game, body.date, body.url);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(await saveGameLink(r.link));
}

/** Body: { game, date, site }. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { game?: unknown; date?: unknown; site?: unknown } | null;
  if (!body || typeof body.game !== 'string' || typeof body.date !== 'string' || typeof body.site !== 'string') return NextResponse.json({ error: 'Body must be { game, date, site }' }, { status: 400 });
  const ok = await deleteGameLink({ game: gameKey(body.game), date: body.date, site: body.site });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No such link' }, { status: 404 });
}
