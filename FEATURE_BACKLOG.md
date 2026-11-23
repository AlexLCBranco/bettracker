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

### BT-26 — Redesign the bet table so dutch bets are fully readable
**In short:** No more "…" cut off text on dutch rows: each split gets its own aligned line, and the table layout is redone to make room.

- The owner called the current dutch row unacceptable: game and bet are cut ("Celtics @ Warriors / Nuggets …", "Jokic 30 pts + Celtics ML / J…").
- Rows may be taller. A dutch row lists every split on its own line, with the split's game, bet and odds lined up in the same columns across all lines and rows. Nothing important is ever truncated on a dutch; wrap or add lines instead.
- Make room: content starts at the left edge of the page, and the Book column goes away from the default view (show the book on hover or in the expanded row).
- The whole website may be redesigned, not just this page (owner said it twice): if a better table needs changes to the shell, navigation or other pages, do them. The v0 prototype is the minimum bar for a v1 ("at least as good as v0"), not the layout to copy.
- Keep: day headers with totals, sticky header, inline editing, settle buttons always visible, no sideways scroll at 1366px.
