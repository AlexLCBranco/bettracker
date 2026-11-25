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

### BT-50 — Games involved: the games I bet on, per day
**In short:** Each day can show the list of games you placed a bet on, one row per game, instead of one row per bet.

From the owner, 2026-11-25 ("a games involved section": the games where I placed a bet).
- Where: a "Games" toggle on each day header in the Bets table switches that day between its bets and its games.
  Days follow the existing day rules (game date, 5am end of day).
- A game counts when any bet of that day has it: a solo's game, any combo leg's game, any dutch split's game.
  PPs (own tables, BT-30) stay out.
- One row per game: game ("Celtics vs Warriors"), sport, number of bets on it, total stake, and its existing links
  (HJ / SS from BT-42). Settled / pending shown in the same style as the bet rows.
- Click a game: the Bets table shows only the bets that include it (clear with Esc or an ×).
- Matching: by the tidied game text (BT-20, `tidyGame`), case and accents ignored, and "A vs B" equals "B vs A".
  Games typed differently beyond that show as two rows; that is accepted.
- A combo whose legs are on different days lists all its games under the bet's game date (legs have no date).
- Table alignment rules apply as everywhere else (no cut text without full text on hover).
- Tests: unit tests for grouping and matching (A vs B / B vs A, combo legs, dutch splits, PPs excluded); e2e that the
  toggle shows the games of a day and that clicking one filters the bets.

### BT-51 — Cash-outs missing "woulda won / lost" keep their W / L buttons on screen
**In short:** A cash-out with no "woulda won / woulda lost" yet shows its W / L buttons all the time, not only on hover.

From the owner, 2026-11-25. Today (BT-37) the dim W / L beside a cash-out's pill only appear when hovering the row
(`ResultCell`, `src/components/BetTable.tsx`), so open ones are easy to miss. He wants them to stay on screen until
answered.
- While `wouldHave` is empty: W and L always visible beside the Cash-out pill (the faint "?" can go, the buttons say
  it). Once one is picked they disappear and the row shows the WOULDA chip as now.
- Same for cash-outs inside dutches and in the multi-select bar's results, wherever a cash-out can be.
- No change to row height or column widths: the buttons sit in the space the hover ones use now.
- Tests: e2e that a cash-out with no answer shows W / L without hover, that clicking one hides them and shows the
  chip, and that an answered cash-out shows no buttons.

### BT-52 — Three descriptions per bet (Pre / Live / Post), clickable in every cell
**In short:** A bet's description becomes three notes, Pre, Live and Post, like the Slate's game notes, and every bet cell has a spot you click to open or add them.

From the owner, 2026-11-25: "descriptions should be also clickable somehow in each cell" and "3 descriptions
available, working kinda the same as on the Slate: post, live and pregame thots".
- Today (BT-47): two texts, Before / After, and a ¶ mark only on rows that already have one. Change to three slots:
  **Pre**, **Live**, **Post**. Existing Before moves to Pre, After moves to Post (data migration, nothing lost).
- Work like the Slate's notes in calendarkit (the Slate widget in gauntlet: PRE / LIVE / POST label in the card's
  corner, notes under the game). Read calendarkit's Slate code and copy its behaviour where it fits a table row;
  do not invent a different scheme.
- Clickable in each cell: every bet cell (single, combo, dutch, split, rollover, ladder) has the mark, also on rows
  with no description yet (dim, to add one). The mark shows which slots are filled (Pre · Live · Post, each lit or dim).
  Click opens the notes under the row on the last filled slot (or Pre when empty), with the three slots one click
  apart; D on the selected row does the same. Hover still peeks. Click away saves, Esc discards, as now.
- Links typed in a note are clickable (open in a new tab).
- The "Descriptions" switch and the bet form show the three slots too; quick-add and search cover all three.
- No change to row height or column widths when closed (alignment rule).
- Tests: unit for the Before/After → Pre/Post migration; e2e: add a note from a row with none, switch slots, links
  clickable, D key, switch opens all.

### BT-53 — Bank a rollover again, with "needs a Mini · 1.06+" to become a shot
**In short:** A rollover that finished under 1.80 can be banked again, and it says which tier and the minimum odds its next bet needs to turn it into a proper shot.

From the owner, 2026-11-25, on a screenshot: "Rollover ×2" won @ 1.70 (Pepsi): Bet 1 won @ 1.53, banked, Bet 2 cashed
out (H$ 170 on H$ 153). He wants to bank it again and see what is missing to make it a shot (1.80+), as "needs a
mini" / "needs a pepsi" with the actual minimum number.
- Banking again: the last bet of a finished rollover under 1.80 (won, or a positive cash-out) has Bank (and B), at
  any depth (a chain banked 2, 3, ... times). `canBank` (`src/lib/rollover.ts`) looks like it already allows the last
  bet of a won chain: first write the e2e for the case in the screenshot (won → banked → positive cash-out → bank
  again) and fix whatever stops it (button hidden on the chain row, cash-out outcome, etc.).
- The needs text: the needed odds are 1.80 / the chain's odds now (1.80 / 1.70 = 1.06), rounded UP to 2 decimals so
  hitting it always reaches 1.80. Shown with the tier those odds fall in (`TIERS` in `src/lib/rollover.ts`):
  "needs a Mini · 1.21+", "needs a Semi · 1.40+", "needs a Pepsi · 1.60+". Under the Mini range (below 1.10): just
  "needs 1.06+", no tier name (the owner has not named that range). At 1.80+ nothing changes ("already 1.80+").
- Where: on every finished rollover row under 1.80 (before banking, so he sees it when deciding), on open shots
  (replaces today's `needsText` "needs 1.29+ to reach 1.80 (Shot)"), in the top-bar Banked list and the Banked tab.
  Tier names come from `TIERS`, so renaming Pepsi later changes it everywhere.
- Alignment: the text sits in the row's second line like the other chips, no new column, no taller rows.
- Tests: unit for needed odds (rounding up, each tier, under Mini, already a shot); e2e for the screenshot case.

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
