# bettracker — working rules for Claude

@AGENTS.md

Personal bet tracker (single user, desktop first, dark theme, UI in English, currency BRL). Rebuild of the v0
prototype at https://v0-gambling-app-nine.vercel.app/ (not its code). v0 is the minimum bar for
functionality and usability, not a layout to copy: changes beyond it are expected. The owner is open to redesigning
the whole website, but a redesign wider than a backlog item asks for is talked through with him first.

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
- Combination total odds are what the book pays, never forced to the legs multiplied. Three prefills, always editable: the Betting Tool prefills a
  combination split's total odds box with its legs multiplied, marked "estimated" and editable (`src/lib/splits.ts`);
  a PP ticket's odds are its legs multiplied, shown "estimated", unless the book's price was typed over it
  (`src/lib/pp.ts`, BT-30); the bet form fills an empty combination total with its legs multiplied, marked
  "estimated", and follows the legs until the book's price is typed over it (`legsOdds` in `src/lib/form.ts`).
- PP batches (BT-30, `src/lib/pp.ts`, page `/pp`) live in their own tables and never count in the Bets or Analytics
  totals. Bonus money (BT-33): a loss costs no real money, a win pays the winnings only as real money; bonus stakes
  never count in real "wagered" (`src/lib/money.ts`, bankroll in `src/lib/bankroll.ts`).
- Profit per result: `src/lib/money.ts`. Win rate = won / (won + lost). ROI = net profit / settled stake.
- A dutch (bets sharing a `dutchId`, `src/lib/dutch.ts`) counts as ONE bet in bet count, pending count, wins, losses
  and win rate: a win when its net profit is above 0, a loss below 0, neither at exactly 0, pending while any of its
  bets is pending. Money figures (net profit, ROI, wagered, pending amount) stay bet by bet.
  No settled bets → "-", never NaN.
- No paid services. Quick-add parsing is rule-based (no AI).

## Testing policy

Automate every check that can be automated: unit, integration, and end-to-end
with Playwright, using throwaway data the test creates and deletes itself. Never hand the owner a manual checklist for something a
script can do. Manual steps only for what truly can't be automated (browser
permission prompts like folder pickers, and judging feel/usability). Keep
those to the minimum, say why each one can't be automated, and give one short
step at a time.

**Vercel requests are a budget** (owner, 2026-11-24: the free plan's 1M CDN requests a month are shared by all his
projects, and going over pauses them all; a full live run costs roughly 10–20k requests). Local runs cost nothing.
- The full suite runs locally (`npm run e2e`), never against the live site unless the owner asks for it.
- After a push the live site gets only the smoke check (`npm run e2e:smoke`, tens of requests).
- Check the live `/version.json` at most every 30 s and stop once it shows the new version; don't browse the live
  site when a local run shows the same thing.

## Commands

- `npm test` — unit + db integration tests (vitest; date tests run in 3 time zones)
- `npm run e2e` — Playwright against a local production build on a fresh `data/e2e.db`
- `E2E_BASE_URL=https://… E2E_PASSWORD=… npm run e2e:smoke` — the live smoke check (`e2e/smoke.spec.ts`): the site
  loads, the version matches, one tagged bet is added and deleted
- `… npm run e2e:live` — the whole suite against the live site: costly in Vercel requests, only when the owner asks;
  every test tags its bets "e2e-…" (dated 2000-01-0x) and deletes them
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check-version`

## Version

package.json's version shows in the bottom-right corner (`SiteVersion` in `src/components/Shell.tsx`) and at
`/version.json` (no-cache). Bump it with every app change (patch fixes, minor features, major big changes);
`scripts/check-version.ts` enforces it in CI.

## Feature backlog, built list and ideas

**Read the lists from `main` on GitHub, never from your local checkout or branch.** The owner's other Claude
sessions push backlog items straight to `main`, and Claude Code sessions run on a branch made at session start, so
`git pull` there does NOT bring in items added later. Run `git fetch origin main`, then read with
`git show origin/main:FEATURE_BACKLOG.md` (same for `BUILT.md` and `IDEAS.md`). Before building, merge `origin/main`
into your branch.

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
