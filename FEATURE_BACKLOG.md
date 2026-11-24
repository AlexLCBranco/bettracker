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

### BT-45 — Marquee select and bulk actions on the Bets table
**In short:** Drag a box over the Bets table to select several bets at once, then settle, label or delete them together and see their totals.

From the owner, 2026-11-24: "marquee select feature, you can guess what the thing should be able to do". The list
below is the session's guess; he has not confirmed it. Today the table has only one selected row (keyboard
settling, `src/app/(app)/page.tsx`); that stays as it is.

- Selecting: press on a row outside any text, input, button or link and drag: a box is drawn and every row it
  touches is selected, the page scrolling when the pointer nears the top or bottom edge. Also Ctrl+click to add or
  remove one row, Shift+click for a range from the last clicked row, Ctrl+A for all rows in the current tab and
  filters. Esc or a click on empty space clears. A drag that starts on text still selects text, as today.
- A dutch, a rollover chain and a ladder are selected as a whole (their one row); never half of one.
- Look: selected rows get their own tint, different from the single keyboard-selected row, with no change in row
  height or alignment.
- Bar: while 2 or more rows are selected, a bar fixed at the bottom shows "n selected", their total stake, the
  profit of the settled ones and what the pending ones would pay, plus the actions below. It follows the Real /
  Hypothetical / Both switch like the stats strip.
- Actions on all selected: Won / Lost / Void (pending plain bets only; dutches, combinations with leg results,
  rollovers and ladders are skipped and the bar says how many were skipped, since they settle part by part); set or
  clear the label; set the game date; set the book; no brainer on / off (only if BT-44 is built); Delete, behind
  one confirm that names the count.
- Every bulk action is ONE undo step (Ctrl+Z, and an "Undo" in the note shown after it) that puts all rows back.
- The single-row keyboard keys (W / L / V / C, T, arrows) do nothing while a multi-selection is active, so a stray
  key cannot settle many bets.
- Tests: unit tests for the selection maths (range, toggle, a dutch as one row, skipped kinds); e2e with throwaway
  bets: drag over three rows and read the totals, bulk Won then Undo, Ctrl+click and Shift+click, bulk delete with
  the confirm.

### BT-47 — See a bet's description without opening the form
**In short:** In the Bets table a bet's written description shows on hover and opens under its row with one click or key, instead of only inside the edit form.

From the owner, 2026-11-24: "a clever way of seeing the description for each bet". Today the two texts a bet has
(`preAnalysis` and `postAnalysis`, the "before" and "after" boxes of `BetFormModal`) are visible only by opening the
edit form. The design below is the session's proposal; he has not confirmed it.

- Mark: a row whose bet has any description shows a small note mark in the bet cell. No description → no mark and
  no reserved space. For a dutch, rollover or ladder row, the mark shows when any of its bets has one.
- Peek: hovering the mark (or the keyboard-selected row after a short pause) shows a popover with the text, "Before"
  and "After" as two short headed parts, only the parts that have text. Long text scrolls inside the popover. It
  never covers the row it belongs to.
- Open: a click on the mark, or one key on the selected row (shown in the mark's tooltip; must not clash with T,
  W / L / V / C), opens the description UNDER the row as one full-width line area: both texts, editable right there.
  Click-away or Esc closes; a click-away saves what was typed, Esc does not. The same key or click closes it again.
  On a row with no description the key opens the empty boxes, so writing one never needs the form.
- For a dutch / rollover / ladder row, the opened area lists each bet's text under that bet's name.
- "Descriptions" switch above the table: on = every row that has a description is open at once, for reading back a
  day or a week. Off by default, remembered in this browser.
- The opened area sits between rows: it must not change column widths or the table alignment, and text wraps, never
  "…".
- Tests: unit tests for "has a description" on plain and grouped rows; e2e with throwaway bets: hover shows the
  text, the key opens it, typing then clicking away saves it (still there after a reload), Esc discards, the
  switch opens all and only the rows with text.

### BT-48 — Day header opens that day's NBA Slate and football day
**In short:** Next to each day in the Bets table, two small marks open calendarkit's NBA Slate and footykit's games for that same day in a new tab.

From the owner, 2026-11-24: "the option of seeing the calendarkit slate and the footykit of a specific day".
Both apps already open on a given day from the address (checked in their repos on 2026-11-24), so nothing is
needed from them:
- calendarkit: `<calendarkit address>?view=league&layout=slate&on=YYYY-MM-DD` (`dayLinkUrl` in its `src/App.tsx`;
  the day is the NBA / US Eastern date).
- footykit: `<footykit address>?date=YYYY-MM-DD` (its default day view, `pageSearch` in `src/components/page.ts`).
- Addresses: calendarkit is served at `https://gauntlet-home.vercel.app/calendar` and footykit under `/football`
  (their `vercel.json` rewrites). Before shipping, open both built links once and confirm they land on the right
  day; keep the two base addresses in one place in the code.

- Where: each day header of the Bets table (`formatDayHeader`, `src/lib/dates.ts`) gets two small marks, "NBA" and
  "Football", each a normal link opening in a new tab (`rel="noopener noreferrer"`), with a tooltip saying what it
  opens ("NBA Slate, 24/11"). The day sent is the header's own date.
- Shown on every day: bettracker does not know which days have games. No change to row height or alignment.
- When BT-46 (gauntlet whiteboard page) is built, its mark sits in the same group, same style.
- Tests: unit tests for both addresses built from a date; e2e that a day header has both marks with the right
  href. No test opens the other sites.

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
