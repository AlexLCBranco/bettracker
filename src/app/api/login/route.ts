import { NextResponse } from 'next/server';
import { safeEqual, sessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.json({ error: 'APP_PASSWORD is not set' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const given = typeof body.password === 'string' ? body.password : '';
  if (!safeEqual(await sessionToken(given), await sessionToken(expected))) {
    await new Promise((r) => setTimeout(r, 500)); // slows guessing
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !process.env.E2E_INSECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
