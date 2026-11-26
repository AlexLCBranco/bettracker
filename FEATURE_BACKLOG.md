# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

**Build order when building everything in one go** (owner, 2026-11-23): BT-34, BT-33, BT-30, BT-31, BT-32, BT-35,
BT-36. One item at a time: finish it, tests green, version bump, moved to `BUILT.md` and committed before starting
the next. With this order BT-30 gets Bonus money from the start and BT-36 includes its "Start this ladder" part.

BT-30 to BT-32 are one feature, the "PP system", written up from a conversation on 2026-11-23.
Build order: BT-30, BT-31, BT-32.

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

### BT-55 — Bets page: big headline tiles instead of the stats strip
**In short:** The thin line of small stats becomes a few big tiles that say how he is doing, and they no longer change when he switches tab.

- Replace the `data-testid="stats"` strip in `src/app/(app)/page.tsx` with a row of tiles (big number, small label,
  small sub line), in this order: **Net** for the chosen period (BT-56; green / red, with a small sparkline of
  cumulative profit over that period, same numbers as `ProfitChart`), **Bankroll** (what `BankrollBar` shows now,
  per money type; click or M inserts money; `BankrollBar` leaves the top bar), **Open** (pending stake, with the
  to-settle count as a button that opens the To settle tab).
- ROI, win rate (with W / L), wagered and the bonus numbers become small secondary text under the Net tile, not
  tiles of their own. The bonus text is short labels, not a sentence.
- The tiles count the chosen period and the filters, never the tab: on To settle / Upcoming / Banked they show the
  same numbers as on All. (Today `summarize(shown)` follows the tab, so Net and ROI go blank there.)
- Money scope "All": never one summed "R$+H$" headline. Show real and hypothetical side by side in the Net tile,
  like the day headers already do (`d.nets`).
- Units view (BT-38) keeps working in the tiles, with the same fallback to money as today.
- Tests: unit tests for the period + filter summary being independent of the tab and for the split by money type;
  e2e that the tiles hold the same values on every tab, and update the specs that read `stat-*` test ids.

### BT-56 — Bets page: period switch (Today / 7d / 30d / Month / All)
**In short:** One click picks the period the headline tiles and the table show, instead of typing From and To dates.

- A segmented switch next to the tiles: Today, 7d, 30d, Month (this calendar month), All. It drives the BT-55 tiles
  and the table. Default: not decided by the owner; use All for the table's sake unless he says otherwise, and
  remember the last choice (localStorage, like the money scope).
- "Today" and day boundaries follow the app's day (ends at 5:00, BT-43, `src/lib/dates.ts`).
- The From / To fields move into the Filters panel (BT-57) as "Custom"; typing there shows the switch as Custom.
- Tests: unit tests for each period's date range around the 5:00 boundary and month ends; e2e for the switch.

### BT-57 — Bets page: filters behind one button, active ones as chips
**In short:** Only Search stays visible; the other seven filters open from a "Filters" button, and any filter in use shows as a small removable chip.

- Visible row: Search, a "Filters" button (with a count when any is on), the "⋯" export menu.
- The panel holds From / To, Book, Sport, Type, Situation, Result, unchanged in behaviour (same `Filters` state).
- Each active filter shows as a chip ("Book: bet365 ×") beside the button; × clears that one; "Clear" clears all.
  The BT-50 game filter becomes one of these chips.
- Nothing is hidden silently: if a filter is on, its chip is always on screen.
- Tests: e2e for opening the panel, setting and clearing each filter by chip; update specs that use `filters`.

### BT-58 — Bets table: day headers with a record, and weekly subtotals
**In short:** Each day's header shows its result more loudly and its W-L record, and each week ends with a subtotal line.

- Day header (`BetTable.tsx`, `day-totals`): net in a larger, bolder, coloured figure; add the day's record
  ("3W 1L", pending count when any) before it. A dutch, rollover or ladder counts once, as in `summarize`.
- After the last day of each week, one subtotal row: bets, record and net for that week, per money type. Week =
  Monday to Sunday (not confirmed by the owner). Only on the All tab.
- No change to the bet rows' columns or heights.
- Tests: unit tests for the day record and the week grouping; e2e that the header and subtotal show the numbers.

### BT-59 — Bets page: key hints for the selected row
**In short:** When a row is selected, one thin line shows only the keys that work on that row, so the shortcuts are not hidden behind "?".

- A single line (fixed place, so the table does not jump: reserve its height) listing the keys valid for the
  selection, taken from the same conditions the key handler in `page.tsx` uses: e.g. a pending bet "W L V C · H J ·
  T label · D description · X no brainer"; a dutch "1-9 toggle · Enter confirm · 0 none · V void · S shared leg";
  an open shot "A add leg · I what if · B close"; a cash-out "W L woulda".
- Each hint is also a button that does the same thing. The full "?" list stays.
- With several rows selected the line is hidden (the bulk bar is there).
- Tests: unit test for the hints per kind of row; e2e that the line changes with the selection.

### BT-60 — Top bar: scope and units move into one menu
**In short:** The top bar keeps the logo, quick-add, Banked and the page links; the money scope switch and the units toggle move into one small settings menu.

- New menu button in the top bar (`Shell.tsx`) holding the money scope switch (Real / Bonus / Hypothetical / All)
  and the units toggle. The button's label shows the current scope and "u" when units are on, so the state is
  never hidden. U still toggles units.
- With BT-55 the bankroll is a tile on the Bets page; on the other pages the top bar still shows `BankrollBar`.
- Export / import ("⋯") stays on the Bets page's filter row.
- Tests: e2e for changing scope and units from the menu on two pages; update specs that click the old switch.

### BT-61 — Analytics: the Odds breakdown uses the shot bands
**In short:** On Analytics, "Odds" groups bets by his own bands (mini, semi, Pepsi, shot) instead of the generic ranges, with shot split into finer rows.

Agreed with the owner on 2026-11-26: the bands replace the generic ranges (not a second breakdown beside them).
- The `odds` dimension in `src/lib/analytics.ts` (`ODDS_RANGES`, `oddsRange`) takes its bands from the tiers
  already defined in `src/lib/rollover.ts` (one source: do not copy the numbers; "Pepsi" is still a placeholder
  name, so a rename there must show here).
- Rows, lowest first: "Below mini" (under the mini minimum), Mini, Semi, Pepsi, Shot.
- Shot (1.8 and up) is one row with its totals, plus indented sub-rows 1.80–1.99, 2.00–2.99, 3.00–4.99, 5.00+,
  so a 1.85 and a 6.0 are not read as the same thing. Sub-rows sort with their parent, never on their own.
- Each row label shows its range next to the name ("Semi 1.33–1.50"). Empty bands are not shown, as today.
- Which odds a bet, dutch or rollover counts with stays exactly as the breakdown does it today.
- The dutch "By combined odds" table (`dutchStats`, BT-41) is not part of this item: left as it is.
- Tests: unit tests for the band of each boundary value (1.09, 1.1, 1.32, 1.33, 1.5, 1.51, 1.79, 1.8, 1.99, 2,
  5) and for the shot row equalling the sum of its sub-rows; update the analytics specs that read odds labels.

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
