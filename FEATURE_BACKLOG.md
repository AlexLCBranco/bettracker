# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

**Build order when building everything in one go** (owner, 2026-11-26): BT-55 to BT-60, BT-61, then BT-67, BT-62,
BT-63, BT-64, BT-65, BT-66, BT-68. One item at a time: finish it, tests green, version bump, moved to `BUILT.md`,
committed and pushed before starting the next.

The PP system (BT-30 to BT-32) is built; these words of the owner's stay in the UI.

Words the owner uses (keep them in the UI):
- **PP**: one combination ticket aiming at total odds of about 20, placed with bonus money. (What the letters stand
  for was never said: do not expand them.)
- **Batch**: a set of PPs built and placed together from one pool of legs. He ran several batches a week, with
  about 100 PPs open at once.
- **Tiers** of legs inside a batch, by his confidence: **Major-major** (the no-brainer, around odds 2, on every PP),
  **Major** (next best, on many PPs; majors can have more than one level), **PP shot** (third tier, on a fixed
  small number of PPs).
- Why it exists: research, not profit. Every opinion gets a spot, and the results show whether what he believes
  works in volume. Before, it was done in Excalidraw with AIs inventing the scheme per batch, the history lived only
  in the bookmaker's app and vanished, and both building and following 100 PPs was the part that broke.

### Bets page redesign (BT-55 to BT-60)

Agreed with the owner on 2026-11-26 (he approved all of it). His complaint: the Bets page is not easy to read in a
glance. Cause found in the code: everything has the same visual weight (one line of `text-xs` stats, eight filter
fields always open, a crowded top bar). Build order: BT-55, BT-56, BT-57, BT-58, BT-59, BT-60.
Rule for all six: the bet table's column alignment must not change (owner, 2026-11-24).

### Analytics redesign (BT-62 to BT-68)

Agreed with the owner on 2026-11-26 ("put all of them in, I'll see how it looks live"), together with BT-61.
Problem found in the code: `src/app/(app)/analytics/page.tsx` is a long scroll of sections with no headline, no
period, and no way from a number to the bets behind it. Build order: BT-67, BT-62, BT-63, BT-64, BT-65, BT-66, BT-68
(the tabs first, so the other items land in their final place). Every rule in CLAUDE.md on what counts as one bet,
on bonus money and on PP batches staying out of Analytics still holds.

### BT-62 — Analytics: headline row
**In short:** Analytics opens with the overall numbers (net, ROI, win rate, record) and names the best and worst segment.

- First thing on the page (Overview tab, BT-67): big tiles for Net, ROI, Win rate (with W / L) and Bets, from
  `summarize` (`src/lib/stats.ts`) over the scoped bets, so they match the Bets page for the same period.
- Two more tiles, "Best" and "Worst": the row with the highest and the lowest profit across the sport, market,
  book, type and situation breakdowns, shown as "<breakdown>: <label>  <profit>". Rows under the BT-65 sample
  threshold and the "Not set" / "Mixed" rows never qualify. Fewer than two qualifying rows: "-".
- Money scope "All": real and hypothetical side by side, never summed (as in BT-55). Units view keeps working.
- Tests: unit tests for best / worst (ties, threshold, none qualifying); e2e that the tiles match the Bets page.

### BT-63 — Analytics: period switch, with change against the previous period
**In short:** The same Today / 7d / 30d / Month / All switch as the Bets page, and the headline numbers show how they moved against the period before.

- Reuse the BT-56 switch and its date ranges (one shared helper and one remembered choice for both pages). It
  applies to the whole Analytics page: chart, headline, every breakdown and section.
- Under each BT-62 headline number, a small "vs previous" figure: the same-length period right before (7d: the 7
  days before; Month: the previous calendar month). Not shown on All, or when the previous period has no settled
  bets.
- If BT-56 is not built yet, build the shared switch here.
- Tests: unit tests for the previous-period ranges (month lengths, the 5:00 day boundary of BT-43); e2e that
  changing the period changes the tables.

### BT-64 — Analytics: breakdowns by no brainer and by label
**In short:** Two new "break down by" choices: no brainer or not, and each label he has put on bets.

- Add `noBrainer` and `label` to `DIMENSIONS` in `src/lib/analytics.ts`, from `Bet.noBrainer` (BT-44) and
  `Bet.label` (BT-27).
- No brainer: two rows, "No brainer" and "Other". A dutch counts by its own mark (X marks the whole dutch).
- Label: one row per label, matched case-insensitively and shown as the chip shows it; bets without one under
  "No label", last. A dutch or rollover whose bets carry different labels: "Mixed", like the leg breakdowns.
- Tests: unit tests for both groupings, dutches included; e2e that the two chips show and list rows.

### BT-65 — Analytics: small samples greyed out
**In short:** A row with too few settled bets is shown faded with a "small sample" note, so a 2-bet +80% ROI does not read as a finding.

- Threshold: fewer than 10 settled bets (won + lost; a dutch counts once). One constant, used by every breakdown
  table on the page (main breakdown, dutch tables, leg record by market) and by BT-62's best / worst.
- Faded rows keep their numbers, lose the green / red colour and the profit bar's colour, and show "small sample"
  on hover and as a small mark by the count. Sorting is unchanged.
- Threshold 10 confirmed by the owner (2026-11-26): keep it easy to change.
- Tests: unit test at 9 and 10 settled; e2e that a small row carries the mark.

### BT-66 — Analytics: click a row to see its bets
**In short:** Clicking a breakdown row opens the Bets page already filtered to exactly those bets.

- The Bets page keeps its filters in component state today (`useState<Filters>` in `src/app/(app)/page.tsx`), so
  this needs the filters readable from the address: `/?sport=…&book=…&type=…&situation=…&result=…`, plus new
  filters for what Analytics groups by and Bets cannot filter yet: market, odds band (BT-61), no brainer and label
  (BT-64). The period (BT-56 / BT-63) and money scope carry over as they are.
- Each new filter shows as a removable chip (BT-57), so he sees why the list is short and clears it in one click.
- The count on the Bets page must equal the row's "Bets" figure: one grouping function used by both pages.
- "Not set" and "Mixed" rows are clickable too. Dutch tables and "One leg away" rows open their bets the same way.
- Tests: unit tests that each Analytics group and its Bets filter select the same bets; e2e for one row per
  breakdown (click, land on Bets, same count, chip shown).

### BT-68 — Analytics: Dutches down to four headline tiles
**In short:** The Dutches tab shows four numbers first and keeps the rest one click away.

- Always shown: Net profit, ROI, Win rate (with W / L, and the settled / pending count as its sub line), Splits hit.
- Behind a "More" switch (remembered): Wagered, Average combined odds, All hit, Some hit, None hit, Sunk by a
  shared leg alone. Nothing is removed.
- The three tables (Which split hits, By number of splits, By combined odds) stay visible under the tiles.
- Tests: e2e that the four tiles show, "More" reveals the other six with the same values as today.

## Held (needs the owner's "go"; never built from "build the backlog")

### BT-46 — Day header opens that day's gauntlet whiteboard page
**In short:** Click a day in the Bets table and the gauntlet whiteboard opens on that day's page, when there is one.

From the owner, 2026-11-24. Held because it needs a gauntlet feature that does not exist yet (checked in the
gauntlet repo on 2026-11-24):
- The whiteboard lives in the browser's IndexedDB under gauntlet's own address (`gauntlet-home.vercel.app`), so
  bettracker, on another address, cannot read it: it cannot know whether a day has a page.
- A gauntlet page has no date: the "Today" stamp (GT-3) drops a plain text like "24/11", no year, nothing a program
  can rely on. And no address opens a given page.

Owner's stopgap (2026-11-24), until a better system: he names each daily gauntlet page with its day by hand
(renaming a page already exists there). So gauntlet only needs an address like `/?date=YYYY-MM-DD` that jumps to
the page whose name is that day, or says "No board for dd/mm" when there is none. That is gauntlet GT-23
(written 2026-11-24).
Blocked: waits for gauntlet GT-23

When gauntlet has it, this item is small:
- Each day header in the Bets table (`formatDayHeader`, `src/lib/dates.ts`) gets a small whiteboard mark that opens
  `https://gauntlet-home.vercel.app/?date=<that day>` in a new tab. The day is the header's own date (game date).
- The mark shows on every day: bettracker cannot tell which days have a page, gauntlet answers that after the
  click. No change to row height or alignment.
- Tests: unit test for the address built from a date; e2e that the header's mark has the right href.
