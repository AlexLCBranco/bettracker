# Built — bettracker

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.

## 2026-11-22
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
