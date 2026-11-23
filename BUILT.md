# Built — bettracker

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.

## 2026-11-23
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
