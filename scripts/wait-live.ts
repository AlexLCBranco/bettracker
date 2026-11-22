// Waits until the live site's /version.json reports the given commit (Vercel finished deploying it).
// Usage: tsx scripts/wait-live.ts <sha>   (base URL from E2E_BASE_URL)
export {};
const sha = (process.argv[2] ?? '').slice(0, 7);
const base = process.env.E2E_BASE_URL;
if (!sha || !base) {
  console.error('usage: E2E_BASE_URL=https://… tsx scripts/wait-live.ts <sha>');
  process.exit(2);
}
const deadline = Date.now() + 15 * 60_000;
let last = '';
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${base}/version.json`, { cache: 'no-store' });
    const v = (await r.json()) as { version: string; commit: string };
    last = `${v.version} (${v.commit})`;
    if (v.commit.startsWith(sha)) {
      console.log(`live: v${v.version} at ${v.commit}`);
      process.exit(0);
    }
  } catch (e) {
    last = (e as Error).message;
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.error(`live site never served ${sha}; last seen ${last}`);
process.exit(1);
