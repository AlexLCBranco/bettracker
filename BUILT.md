# Built — bettracker

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.

## 2026-11-25
- BT-51 — Cash-outs missing "woulda won / lost" keep their W / L buttons on screen (v0.44.0)
  A cash-out with no "woulda won / woulda lost" yet shows its W / L beside the pill all the time (not only on hover); once one is picked they go and the WOULDA chip shows.
- BT-49 — Banked shot "what if": try a next-leg odd and see the final shot (v0.43.0)
  On an open shot, "what if" (or I) opens a box under the row (and in the top-bar Banked list) where you type one or more odds ("1,15; 1,2; -500") and see each one's final odds, tier, payout and profit on the first stake; Enter or "Place this leg" opens "+ Add leg" with that odd, which shows the same preview under its odds box.

## 2026-11-24
- BT-48 — Day header opens that day's NBA Slate and football day (v0.42.0)
  Each day header in the Bets table has small "NBA" and "Football" marks that open calendarkit's NBA Slate and footykit's games for that day in a new tab.
- BT-47 — See a bet's description without opening the form (v0.41.0)
  A bet (or dutch, rollover, ladder) with a description shows a small ¶ mark: hovering it peeks at the Before / After text, a click or D opens both texts under the row to read and edit (a click elsewhere saves, Esc discards), and the "Descriptions" switch above the table opens every row that has one.
- BT-45 — Marquee select and bulk actions on the Bets table (v0.40.0)
  Drag a box over rows (starting outside the text), Ctrl+click, Shift+click or Ctrl+A to select several; a bar at the bottom shows how many, their stake, settled profit and what the pending ones would pay, with Won / Lost / Void (pending plain bets), label, game date, book, no brainer on / off and Delete, each one Ctrl+Z step; also fixes the no brainer button pushing a pending dutch's actions past the table edge (now in its ⋯ menu).
- BT-44 — "No brainer" mark on a bet (v0.39.0)
  A bet or a whole dutch can be marked a no brainer (the NB button on the row, X on the selected row, the checkbox in the bet and dutch forms, or "#nb" at the end of a quick-add line): its bet cell is tinted violet with a "NO BRAINER" chip, separate from its label.
- BT-43 — The day ends at 05:00, not midnight (v0.38.0)
  Until 5 in the morning the app still treats it as the day before: new bets, dutches, PPs, ladders and money entries default to it, "Today" / "Yesterday" headers and typed "t" / "y" follow it, so late NBA games stay on the night they were bet.
- BT-42 — Game page links (Hoops Junkie / Sofascore) (v0.37.0)
  In the game editor (double click a game) a "Game link" box takes a pasted Hoops Junkie or Sofascore page (any site works, up to two per game); every bet on that game and date then shows a small HJ / SS mark next to the game that opens the page in a new tab.
- BT-41 — Analytics: dutch split stats (v0.36.0)
  A "Dutches" block on Analytics: settled dutches, wagered, net profit, ROI, win rate and average combined odds, the splits hit record with the all / some / none hit tiles, which split hits (lowest, middle, highest odds) and tables by number of splits and by combined odds.
- BT-40 — Betting Tool: target odds mode for a dutch (v0.35.0)
  A "Target odds" switch in the Betting Tool: type the odds you have and the combined odds you want, leave one split empty, and it shows what that split needs (2.76 / +176), the stakes and the return, the real combined odds for what you found, and "Use in dutch" fills the normal dutch with it.
- A bet quick-added while the page is still loading stays on the page (v0.34.2)
  On the live site the first load could answer after a quick-added bet was saved and wipe it from view (it was saved, and came back on reload); the first load now waits for such saves and loads again.
- Editing a ladder rung in the full form keeps it in its ladder (v0.34.1)
  Saving an edit of a rung (text, stake, odds…) used to drop it out of its ladder and lose the goal; it now stays a rung.
- BT-38 — Units: type a stake as "1u" and view everything in units (v0.34.0)
  Each money type gets a unit size on the Bankroll page; a stake can be typed as `1,5u` (quick-add, bet form, Dutch tool, cash-out box) with a preview `1,5u = H$ 150,00`, and the `$ | u` switch (or U) shows stakes, profit, cash-outs, day totals and Analytics in units without moving any column.
- BT-37 — "Woulda won / woulda lost" on a cashed-out bet (v0.33.0)
  On a cash-out, W or L (or the dim W / L beside the pill on hover) records what would have happened: the row shows `WOULDA WON · LEFT R$ 43,00` or `WOULDA LOST · SAVED R$ 145,00`, a cash-out without it has a faint "?" in its pill, and Analytics shows the Cash-out verdict (saved − left).
- BT-39 — A shot banked from a dutch split shows the dutch's real odds (v0.32.2)
  A shot started from a won dutch split now counts the whole dutch's stake: H$ 139,86 back on a H$ 100 dutch reads @ 1.40 Semi and "needs 1.29+", not @ 3.00 "already 1.80+ (Shot)".
- A banked dutch split shows its name under its shot (v0.32.1)
  Under a shot started from a dutch split, the bet row now shows the split's selection (e.g. "Scottie 2 4Q ass") instead of "(no text)".
- Bank a positive cash-out for a rollover (v0.32.0)
  A bet cashed out for more than its stake now has the Bank button (and B) like a won bet: its cash-out amount starts a shot and is the next leg's stake.
- Z right after a delete or edit always undoes it (v0.31.2)
  Deleting a bet, a dutch or a bankroll entry (or editing a bet) and pressing Z within half a second did nothing on the live site, because the undo step only appeared once the server answered; it now exists at once.
- Changes save in order on the live site, and the page warns before leaving while saving (v0.31.1)
  A settle followed at once by Z (or a delete and its undo) could end up saved the wrong way round, coming back after a reload; saves now go one at a time, a muted "saving…" shows next to the version while any are pending, and leaving or reloading the page then asks first.

## 2026-11-23
- Banked bets at a glance: a Banked figure in the top bar and a Banked tab (v0.31.0)
  With any bet banked, the top bar shows "⤴ 3 banked" with the total waiting (per money type) and one small gauge per shot filling toward 1.80 (green once there, indigo for a ladder); a click lists them oldest first with amount, odds and tier, what the next bet needs and since when, and opens the one picked on the new Banked tab of the Bets page.
- Bank a won dutch split for a rollover (v0.30.0)
  A won split in a dutch has Bank (or B when selected), which starts a rollover shot with that split's payout shown in its own row next to the dutch; the dutch and its shot count as one bet, pending while the shot is open, and its net is the shot's result plus the other splits.
- Ctrl+Z undoes the last change to your bets, and a bet can be taken out of a ladder (v0.29.0)
  Ctrl+Z (or Z on the Bets page, or Ctrl+Z in the empty quick-add box) undoes adding, editing, deleting, settling and every ladder or rollover step, newest first; the Bets page shows "↶ Undo: <last change>" and toasts after a change carry an Undo button; deleted bets come back as they were; a bet in a ladder or rollover has "Remove from ladder" (or "Remove from rollover") in its ⋯ menu, which keeps it as a plain bet with its own stake, odds and money (then editable) and closes the ladder up behind it.
- BT-36 — Ladder simulator: plan a ladder rung by rung before betting it (v0.28.0)
  A new "Ladder sim" page: start, odds (any format) and rungs on top, one compact row per rung (odds typed over per rung with a reset x and its tier chip, stake in, pays, profit, total odds "×6.86", fair chance with "1 in 613", a one-line note, a log-scale bar), a target that marks its rung and dims the rest with the odds per rung it needs, a summary line, a random "Try it" with a running tally, the plan kept across reloads (Reset clears), "Start this ladder" opening the bet form as rung 1 with the goal, and "Open in sim" on an open ladder loading its placed rungs locked.
- BT-35 — Ladder: let the whole payout ride from one bet to the next, shown as rungs (v0.27.0)
  "Ladder" in the bet form (or "ladder", "ladder:5", "ladder:R$1600" in quick-add), or "Start ladder" next to Bank on a won bet, makes rung 1 of a ladder with an optional goal; a won rung offers "+ Next rung" (the whole payout as its fixed stake) and "Take R$ 400,00", a lost rung ends it losing the first stake only, the row shows the rungs ("R$ 100,00 → R$ 200,00 → R$ 400,00 → next: R$ 800,00 @ 2.00", "rung 3 of 5") with the current rung highlighted, Z undoes each step, and Analytics (Type) has a Ladders group.
- BT-32 — PP stats: per batch and across batches (v0.26.0)
  A batch has a Stats tab (won / dead / alive, staked, returned, profit; per tier won–lost and hit rate next to what the odds implied, with the edge; "Lost by one": the leg that killed PPs that were otherwise complete, with its actual and note), and the top of the PP page shows the same per-tier table over all batches in a date range, hit rate per tier over time (one point per batch) and leg hit rate by sport and by market.
- BT-31 — PP builder: scheme helper and ticket generator (v0.25.0)
  A batch's Build tab shows the pool by tier, a scheme (number of PPs, target and band, % of PPs per Major level, PPs per PP shot, two toggles) starting from the last batch's with a plain-words proposal ("Use proposal") and a live preview (legs and odds per PP, outside the band, appearances per leg, total stake and potential), generates the PPs semi-randomly from a seed (Shuffle draws again; legs that fell short are listed), and gives a placing checklist with copy-friendly lines, Space to tick and move down, and a box for the book's odds.
- BT-30 — PP batches: leg pool, tickets, leg-first settling, archive (v0.24.0)
  A new "PP" page lists batches (won / alive / dead, one leg away, staked, returned); a batch is a pool of legs by tier (Major-major, Major, PP shot, levels can be added or renamed) plus its PPs, each leg is settled once with W / L / V (↑ ↓, T for actual and note, Z undo) and every PP follows, a leg that decides PPs is flagged and first in its tier, the Tickets view shows each PP with coloured leg chips, estimated or book odds, potential and status with filters and sorting, PPs can be added by hand, the batch is read-only until Edit, and placed PPs count in the bankroll and in export / import.
- BT-33 — Bankroll: insert real, bonus and hypothetical money, and see what you have (v0.23.0)
  Bonus (B$, amber) is a third money type everywhere (form, dutch log, "B$10" in quick-add, the Real / Bonus / Hypothetical / All switch, export) whose losses cost nothing and whose wins pay the winnings only as real money; the top bar shows R$, Bonus and H$ now (pending under each, click for each book with the next bonus expiry, expired unused and bonus converted), M or "Insert money" puts money in or takes it out, /bankroll lists every entry to edit or delete (Z undoes), and the bet form shows the balance and warns when the stake is more.
- BT-34 — Cash-out button "C" next to W / L / V, typed as an amount or a percentage (v0.22.0)
  A blue C after W / L / V on every unsettled bet, dutch split and open rollover bet opens the cash-out box, which takes the money returned ("140,50") or a share of the full payout ("70%", or the R$ / % toggle, remembered) and shows both with the profit before Enter; a cashed-out pill reads "Cash-out · R$ 140,00 (70%)".
- BT-29 — Rollover shot: bank a won bet and add a leg later (v0.21.0)
  "Bank" (or B) on a won bet keeps it open as one shot ("Banked R$ 160,00 @ 1.60 · needs 1.13+ to reach 1.80 (Shot)" with a Mini / Semi / Pepsi / Shot chip); "+ Add leg" (or A) logs the next bet with the whole payout as its fixed stake and the same money, and the chain is one row and one bet with the odds multiplied, the first stake wagered and final payout − first stake as profit; Close (or B) ends it, and Z undoes bank, add leg and close.
- BT-28 — Leg results: one-click W / L / V, and legs, splits and dutch always agree (v0.20.0)
  A pending leg has W / L / V buttons (a settled one changes from its result); a lost leg loses its bet, all legs won wins it, a shared leg of a dutch is set on every split, a bet set won or back to pending takes its legs along, and a lost bet's unknown legs show "?" instead of "Pending", all undone with Z in one step.
- BT-27 — Label chip and actual results on a bet (v0.19.0)
  T on a selected row (or "+ label / result" on hover, or the full form) sets a label shown as a small uppercase chip and what actually happened ("McCain 25+ pts → 24 pts"); a lost combination lists every losing leg with its actual ("✗ Jokic 12+ ass 11 · ✗ Celtics ML 111-112") instead of the red "lost by" text, which no longer glues the market onto the leg and now finds legs that lost on dutch splits.
- BT-26 — One "Bets" page: Dashboard, History and Settle merged, a table that does not cut text (v0.18.0)
  The site is Bets, Analytics and Dutch tool, full window width, with one Real / Hypothetical / Both switch in the top bar; Bets has a stats strip, one row of filters (Export / Import under "⋯", keys under "?"), All / Pending / To settle tabs, and a table whose bet text wraps, whose numbers line up on every row type, whose dutches show their splits, where a click selects a row, the settle keys work on it in any tab and a double click edits.
- BT-25 — Easier way to add or change the game of a logged bet (v0.17.0)
  Double click on the game of any row (single, combination, dutch, leg) opens a small game editor with recent games (one box per game, plus one for legs with no game); bets with no game show a "+ add game" button; a "Combo" with no legs (unless its text is "a + b") is a Solo.
- BT-24 — Fix the dutch "⋯" menu glitch (v0.16.1)
  The ⋯ menu on bet and dutch rows opens in full above the rows below it, stays open while the mouse is on it, opens upward near the bottom of the window, and no longer closes at once after typing in the search box.
- BT-23 — Bet History redesign: clearer and prettier (v0.16.0)
  Bets sit under a header per day ("Sun, 22 Nov · 5 bets · +R$ 185,48"), each row has one result pill with at most one line under it ("1 of 2 splits hit", "lost by Celtics ML"), games read "Celtics @ Warriors +1", dutch splits open as "Split 1", "Split 2" joined to their dutch, and ✎ / ⋯ show on hover.

## 2026-11-22
- BT-17 — Combo rows: legs, games and a leg count (v0.15.0)
  A Combo row shows its legs' games and league, a ▸ to open its legs (or "Add legs" when none were entered), "Combo · 2" in Type and a "1/2" legs-hit count; a combination with one leg is saved as a Solo, the form says so, and quick-add makes a Solo (or a Combo with legs for "a + b").
- BT-18 — Same styling on every row (v0.15.0)
  Profit has one size and weight on every row, H$ stakes are violet on every row, won rows all share one tint, and W / L / V show only on unsettled bets.
- BT-19 — Dutch result badges: no warning look, no repeats (v0.15.0)
  A dutch that won with some splits hit shows a green "1/2", a lost dutch where nothing hit shows only "Lost" (what missed is in its tooltip), and the purple "Dutch" chip is gone.
- BT-20 — Consistent text: names, units, games, odds (v0.15.0)
  Games are saved and shown as "A vs B" (from "@", "v", "x"), stat units in lower case ("pts"), names in their proper spelling ("McCain") in saves and suggestions, odds with the decimals they pay (1.9924), and cut game text shows in full on hover.
- BT-21 — Date column: no repeated date (v0.15.0)
  "game dd/mm" under the bet date shows only when the game is on another day (hover the row to edit it otherwise).
- BT-22 — Warn when a team plays twice on one day (v0.15.0)
  The bet and dutch forms show a warning when a game puts a team in a second game on the same date, from this bet or any other.
- BT-14 — Hypothetical money (H$ paper bets) (v0.14.0)
  A bet or dutch can be logged in hypothetical dollars (Money: Hypothetical in the full form and the dutch log, or "H$150 @2.10 …" in quick-add; last-used is remembered), shown as H$ in violet everywhere; the dashboard and Analytics count Real only by default with a Real / Hypothetical / Both switch, History has a Money filter, and export/import keep it.
- BT-12 — Edit a logged dutch as a whole (v0.13.0)
  A dutch row has ✎ Edit, which opens the log form with the saved dutch (selections, legs, shared legs, odds in any format, stakes, books, games, markets, dates); saving updates its bets in place and keeps results already set, a removed split deletes its bet and "+ Add split" adds one.
- BT-13 — Clearer wins and losses (v0.12.0)
  Every bet, dutch and leg row has a coloured left edge and a sign (green ✓ won, red ✕ lost, amber ½ half, grey … pending, – void), a lost combination says "✕ lost by Celtics", a dutch row is coloured by its net with the net profit in large type, and its splits show ✓ hit / ✕ miss.
- BT-15 — History table fits the screen (v0.11.0)
  History and the dashboard fit a 1366px screen without scrolling sideways: bet and game dates, game and sport, and type and situation share a column, long text is cut with the full text on hover, Duplicate and Delete moved into a "⋯" menu, and the actions column stays pinned on the right.
- BT-16 — Every odds box accepts any odds format (v0.10.0)
  Typing -114, +220, 5/2, 1,3 or 40% in the bet form (total and legs), the quick-add line ("@-114") or a History odds cell shows "-114 → 1.88" while typing, turns into the decimal value when you leave the box, and is saved as decimal.
- Fix: bets reload when you come back to the tab, so bets added, settled or deleted elsewhere (another tab, the phone, a test run) show up without reloading the page (v0.9.1)
- BT-10 — One-click settle buttons on a dutch row (v0.9.0)
  A pending dutch in History and on the dashboard has 0 W, All W, Pick W… (one button per split with two, checkboxes with more), Shared ✕ and V; Undo shows for 8 s and Z undoes, the same as the Settle page.
- BT-11 — Fix: live e2e tests no longer leave bets behind (v0.9.0)
  Each test deletes the bets it made by id even when it fails, and a final sweep removes any e2e bet still there (also older leftovers such as "e2e-mwskca2engub edit me") and fails the run if a test leaked one.
- BT-9 — Betting Tool clears after "Log as bets" (v0.8.0)
  Once a dutch is saved the selections and shared legs clear (total stake and rounding kept, a reload stays empty) and a note says "Dutch logged: 2 bets, R$ 100,00" with View in History and Undo clear.
- BT-8 — Log dutch: Game(s) and Market(s) picked per leg (v0.8.0)
  The log form takes several games and markets as chips (Enter or comma adds, Backspace removes), every leg and shared leg picks its own (a pick fills the legs below), and History shows "2 games · 2 markets" where a bet or dutch spans several.
- BT-7 — Betting Tool: "If this many win" outcome table (v0.8.0)
  Under the stakes a table shows returns, profit and ROI if 0, 1, 2 … every selection wins (ranges when returns differ), highlights the break-even row, adds "Shared leg loses" with shared legs, and a compact copy appears in the log form; the tile is now "Profit if 1 wins".
- BT-6 — Dutch hit count: "1/2" badge and misses counted once (v0.7.0)
  Every dutch shows a coloured hits/splits badge (green all, amber some, red none, grey while pending) with its distinct missed legs, a lost shared leg counted once; expanded dutches mark each split hit/miss and lost legs in red, and Analytics (Type) adds Dutch hits.
- BT-5 — Dutch of combinations: splits with several legs and a shared leg (v0.6.0)
  In the Betting Tool a selection can have legs (+ leg) and shared legs are typed once, each split gets a total odds box prefilled from its legs (type the book's price over it), it is logged as a real combination bet, and the Settle page settles a dutch with several winners (1-9 toggle, Enter confirms) or a lost shared leg (S).
- BT-4 — Dutch bets: log a dutch from the Betting Tool and track it as one group (v0.5.0)
  The Betting Tool reads odds in any format (decimal, American, fractional, Hong Kong, Indonesian, Malay, probability) and logs a dutch as linked bets in one go; History and the dashboard show it as one expandable row, Settle settles it with a number key (0 none won, V void, Z undo), and counts and win rate treat it as one bet.
- BT-3 — Export and import (v0.4.0)
  History has Export JSON (everything, as a backup), Export CSV (one row per bet) and Import JSON, which adds the bets from an export that are not already there and never changes existing ones.
- BT-2 — Betting Tool: dutching calculator (v0.3.0)
  A new Betting Tool page splits a total stake across selections so each returns the same, shows the profit and combined odds, warns when the odds cannot pay off, and remembers the last calculation.
- BT-1 — Analytics page (v0.2.0)
  A new Analytics page breaks down bets, wagered, profit, ROI and win rate by sport, book, market, odds range, type or situation, and shows which leg lost each combination.
- Fix: a quick edit on a bet is no longer undone by a second change made right after it, such as editing the book and then clicking Won (v0.1.3)
- Phase 1: bet logging, dashboard, history and settle queue (v0.1.0, v0.1.1)
  Log bets with a one-line quick-add or the full form, see stats and the profit chart on the dashboard, filter and edit every bet inline on History, and settle due bets by keyboard on the Settle page.
  - Data: bets with legs (solo = 1 leg, combination = none or 2+), 7 results, profit per result, BRL, local dates shown as dd/mm/yyyy, stored in Turso.
  - Autocomplete on every text field (book, sport, game, market, selection, bet text, quick-add): recent entries on focus, match-anywhere filtering ranked by recent and frequent use, arrows/Enter/Tab/Esc, sport narrows game, market and selection.
  - Quick-add line on every page ("150 @2.10 lakers ml" + Enter, comma or dot decimals); anything it can't read opens the full form prefilled.
  - Full form: last-used book, sport, type and situation; dates default to today; live potential return; stake presets from history; legs with their own results; "Save and add another"; Duplicate on every bet.
  - Dashboard: Net Profit/Loss, ROI %, Total Wagered, Win Rate (W/L), Pending (count and amount), cumulative profit chart, recent bets table with expandable legs.
  - History: every bet with filters (date range, book, sport, type, situation, result, text), inline editing of any cell, one-click W/L/V buttons, edit, duplicate, delete.
  - Settle queue: due pending bets oldest first; W won, L lost, V void, C cash-out (asks the amount), H half-won, J half-lost, arrows, Z undo. Due count in the nav.
  - Keyboard: N opens a new bet anywhere; Enter saves, Ctrl+Enter saves from any field, Ctrl+Shift+Enter saves and adds another, Esc closes.
  - Password login (one password), version in the bottom-right corner and at /version.json.

### Internal
- CI live tests now run: the wait-for-deploy script no longer uses top-level await, which tsx refused to compile (v0.1.2).
- Tests: unit (profit maths, win rate/ROI incl. zero bets, dates in 3 time zones, quick-add parsing, autocomplete ranking/filtering, settle actions and undo, form, filters, auth), database integration, Playwright e2e locally and against the live site; CI on GitHub Actions.
