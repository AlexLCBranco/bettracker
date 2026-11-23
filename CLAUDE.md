# bettracker — working rules for Claude

@AGENTS.md

Personal bet tracker (single user, desktop first, dark theme, UI in English, currency BRL). Rebuild of the v0
prototype at https://v0-gambling-app-nine.vercel.app/ (its layout and fields, not its code).

## Stack

- Next.js (App Router, `src/app`) + Tailwind v4 + TypeScript. Read `node_modules/next/dist/docs/` before using a
  Next API: this Next version differs from older ones (e.g. `src/proxy.ts`, not middleware).
- Database: Turso (libSQL), `src/lib/server/db.ts`. Env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Locally without
  them: SQLite file `data/local.db` (git-ignored). Schema is created on first use (`CREATE TABLE IF NOT EXISTS`).
- Access: one password, env `APP_PASSWORD` (`src/lib/auth.ts`, `src/proxy.ts`). Open in `next dev` without it,
  locked (503) in production without it.
- All bets are loaded once into the client (`AppProvider`); autocomplete, stats and filters run in the browser.

## Rules from the spec (do not break)

- Dates are local "YYYY-MM-DD" strings, never `Date` objects or UTC; shown as dd/mm/yyyy (`src/lib/dates.ts`).
- Combination total odds are entered by the user; never multiply legs.
- Profit per result: `src/lib/money.ts`. Win rate = won / (won + lost). ROI = net profit / settled stake.
- A dutch (bets sharing a `dutchId`, `src/lib/dutch.ts`) counts as ONE bet in bet count, pending count, wins, losses
  and win rate: a win when its net profit is above 0, a loss below 0, neither at exactly 0, pending while any of its
  bets is pending. Money figures (net profit, ROI, wagered, pending amount) stay bet by bet.
  No settled bets → "-", never NaN.
- No paid services. Quick-add parsing is rule-based (no AI).

## Testing policy

Automate every check that can be automated: unit, integration, and end-to-end
with Playwright against the live site, using throwaway data the test creates
and deletes itself. Never hand the owner a manual checklist for something a
script can do. Manual steps only for what truly can't be automated (browser
permission prompts like folder pickers, and judging feel/usability). Keep
those to the minimum, say why each one can't be automated, and give one short
step at a time.

## Commands

- `npm test` — unit + db integration tests (vitest; date tests run in 3 time zones)
- `npm run e2e` — Playwright against a local production build on a fresh `data/e2e.db`
- `E2E_BASE_URL=https://… E2E_PASSWORD=… npm run e2e:live` — the same suite against the live site; every test
  tags its bets "e2e-…" (dated 2000-01-0x) and deletes them
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check-version`

## Version

package.json's version shows in the bottom-right corner (`SiteVersion` in `src/components/Shell.tsx`) and at
`/version.json` (no-cache). Bump it with every app change (patch fixes, minor features, major big changes);
`scripts/check-version.ts` enforces it in CI.

## Feature backlog, built list and ideas

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. Item IDs are BT-1, BT-2, ... (never reused).
- `BUILT.md`: shipped work only, newest first, under `## <YYYY-MM-DD>` headings, as `- BT-n — title (v<version>)`
  plus at most one plain sentence on what the owner sees. Work without a backlog item: same line without the ID.
  Invisible housekeeping goes under `### Internal` at the bottom of that day.
- `IDEAS.md`: ideas the owner mentioned that are not planned, as `- I-n — idea (YYYY-MM-DD) [why: …]`. Never built
  from directly; "promote I-n" moves one to the backlog.

When an item ships, in the same commit: cut it from `FEATURE_BACKLOG.md`, add it to `BUILT.md`.
Every backlog item's first line under its `### BT-n — title` heading is `**In short:** <one plain sentence>`.
Guard: `scripts/check-lists.mjs` (run by `npm run check-version`) fails if an ID is planned and built, repeats, or
package.json's version has no `BUILT.md` entry.
