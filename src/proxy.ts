import { NextResponse, type NextRequest } from 'next/server';
import { accessMode, safeEqual, sessionToken, SESSION_COOKIE } from './lib/auth';

const PUBLIC = ['/login', '/api/login', '/version.json'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  const mode = accessMode({ APP_PASSWORD: process.env.APP_PASSWORD, NODE_ENV: process.env.NODE_ENV });
  if (mode === 'open') return NextResponse.next();
  if (mode === 'closed') return new NextResponse('BetTracker is locked: set APP_PASSWORD in the Vercel project environment variables.', { status: 503 });
  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (cookie && safeEqual(cookie, await sessionToken(process.env.APP_PASSWORD!))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
