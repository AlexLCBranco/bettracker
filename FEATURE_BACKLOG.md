# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-24 — Fix the dutch "⋯" (More dutch actions) menu glitch
**In short:** Pressing ⋯ on a dutch row opens an empty, half cut off dark box instead of the Duplicate / Delete menu.

- Seen on v0.16.0, History table, dutch row "Celtics @ Warriors / Nuggets…" (owner's screenshot, 2026-11-23): the box shows with no visible items, drawn under the button and overlapping the next rows.
- Reproduce it first with Playwright (open ⋯ on a dutch row, then move the mouse onto the menu) before changing anything. Suspects, not confirmed: the menu lives inside the hover-only actions span, so it fades with it once the mouse leaves the row; and `position: fixed` inside the sticky actions cell.
- Done when: the menu opens fully visible with both items, stays while the mouse is on it, and never gets clipped, on bet rows and dutch rows. Add an e2e check that the menu items are visible and clickable after the mouse moves onto them.

### BT-25 — Easier way to add or change the game of a logged bet
**In short:** Setting or changing the game on a bet that is already logged takes one click on the game, for single bets, combinations and dutches.

- Today: a bet row edits only its first leg's game inline; a dutch row's game text is not editable at all (only through Edit dutch or by expanding and editing leg by leg).
- Proposed (owner has not confirmed the details yet, ask him if unsure): clicking the game on any row opens one small game editor with autocomplete of recent games. A row with one game: one field, applied to every leg / split that has that game or none. A row with several games: one field per distinct game, plus the legs with no game.
- "no game" rows show an obvious "add game" target, not just muted text.
- Bug to reproduce first (owner, 2026-11-23, v0.16.0): on the "no game" row "Jokic 6 4Q pts" (Combo ×0, live, Old Book) he tried to add the game from the table and could not. Find out why with Playwright before redesigning.
- Owner's ask: double click on the game (or on "no game") starts editing it, on every row type. Add an e2e test that adds a game to a "no game" bet this way.

### BT-26 — One "Bets" page: merge Dashboard, History and Settle, with a table that does not cut text
**In short:** The site becomes three pages (Bets, Analytics, Dutch tool); Bets is one full-width table with stats on top, and bet text is no longer cut with "…".

Agreed with the owner on 2026-11-23 after looking at the live site (v0.16.0). Usability is the priority. Anything not written here that changes a page's structure: ask him first.

**Site structure**
- Navigation: Bets (home, `/`), Analytics, Dutch tool. The separate History and Settle pages go away (redirect `/history` and `/settle` to `/`).
- Layout uses the full window width (today a ~1120px centered column leaves about 30% of a 1568px window empty while the table truncates).
- One Real / Hypothetical / Both switch in the top bar, applied to every page (today: a toggle on Dashboard and Analytics, a "Money" filter on History).
- The "Performance Over Time" chart moves to Analytics.

**Bets page**
- Top: a thin strip of the stats now on the Dashboard cards (net profit, ROI, wagered, win rate, pending), one row, small.
- Then one row of filters (the History filters, minus Money) and Export / Import in a "⋯" menu.
- Tabs: All / Pending / To settle (To settle = the old Settle queue: pending bets with a game date of today or earlier, oldest first; its count stays as the badge).
- The settle keys (W L V C H J, 1-9, Enter, 0, S, arrows, Z) work on the selected row in any tab. It must be as fast as the old queue: after settling, selection moves to the next row. The key legend becomes a "?" popover, not a row of text.

**Table: no "…", everything aligned**
- Columns: [▸] [Bet: takes ALL leftover width] [Stake] [Odds] [+/-] [Result] [actions]. Stake, Odds, +/- and Result are fixed, narrow, numbers right-aligned with tabular digits; the Result column is only as wide as its pill.
- The Bet cell is two lines: line 1 the bet text (bold), line 2 muted "game · sport · market · book" plus the type tag (Combo ×n, Dutch ×n, LIVE) and the result sub-line ("1 of 2 splits hit", "lost by …"). Game, Book and Type stop being columns; that is where the width comes from.
- Bet text wraps to a second line instead of truncating. "…" is allowed only on the muted line, and only with the full text on hover.
- A dutch row shows one such two-line block per split, stacked, and each split's own odds and stake sit in the Odds and Stake columns on that split's line, so numbers line up down the page across singles, combos and dutches. The dutch's combined odds, total stake and profit sit on a summary line.
- Rows are as tall as they need to be.
- Keep: day headers with totals, sticky header, inline editing (double click, see BT-25), settle buttons always visible, no sideways scroll at 1366px.

**Tests**
- e2e with throwaway long bets (a 3-split dutch of combinations with long names) at 1366px and 1920px: no bet text is truncated (`scrollWidth <= clientWidth` on every bet line), no horizontal scroll, and the Odds / Stake / +/- cells of different row types share the same x position.
- e2e: settle three bets in a row from the To settle tab with the keyboard only.
