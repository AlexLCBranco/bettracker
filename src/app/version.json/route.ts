import { BUILD_INFO } from '@/lib/build-info';

// The live site's version, never cached, so a deploy can be checked against the latest push.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(BUILD_INFO, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
