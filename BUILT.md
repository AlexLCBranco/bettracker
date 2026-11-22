# Built — bettracker

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.

## 2026-11-22
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
- Tests: unit (profit maths, win rate/ROI incl. zero bets, dates in 3 time zones, quick-add parsing, autocomplete ranking/filtering, settle actions and undo, form, filters, auth), database integration, Playwright e2e locally and against the live site; CI on GitHub Actions.
