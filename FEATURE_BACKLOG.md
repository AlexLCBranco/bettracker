# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-7 — Betting Tool: "if 0 / 1 / 2 / … win" outcome table
**In short:** Under the stake table, a small table shows the return and profit if 0, 1, 2 … up to every selection wins, since splits with player props can win together.

Today the summary only shows "Profit if one wins", which assumes the selections exclude each other. With player
props (e.g. McCain 25 pts + Celtics W and Mitchell 30 pts + Celtics W) several can win at once, and with 3+
splits the owner needs the whole picture.

- New card under the stake-per-selection table, titled "If this many win". One row per count, from 0 up to the
  number of selections: "Wins", "Returns", "Profit", "ROI".
  - Returns for k wins = sum of the k selections' returns. When the returns differ (rounding, or a total odds
    typed over the estimate), show the range "min – max" (k lowest returns to k highest), and profit and ROI as
    ranges too; when they are equal, one number.
  - Profit = returns − total stake; ROI = profit / total stake. Profit coloured: green above 0, red below 0,
    grey at 0.
  - Highlight the first row where profit turns positive (e.g. a thin green left border and "break-even from 1
    win"), so with 3+ splits it is obvious how many must hit.
- When there are shared legs, add one row at the top: "Shared leg loses" = every selection loses, returns
  R$ 0,00, profit = − total stake (same numbers as 0 wins, named so it is clear one miss sinks it all).
- Rename the existing "Profit if one wins" card to "Profit if 1 wins" so it matches the table; keep it.
- Live: updates as stake, odds, total odds and rounding change; hidden while the calculation is invalid, like the
  rest of the results.
- Shown in the "Log dutch as bets" form too, as a compact read-only copy, so it can be checked before saving.
- One pure function in `src/lib/dutching.ts` (input: total stake and each selection's stake and odds; output:
  rows with min / max returns, profit, ROI). Unit tests: 2 equal splits, 3 splits with different odds (ranges),
  rounding to R$ 1, shared-leg row present only with shared legs, break-even row. e2e: 3 selections, check the
  table rows and the highlighted break-even row.

### BT-8 — Log dutch: "Game(s)" and "Market(s)", picked per leg
**In short:** In the "Log dutch as bets" form, Game and Market both take several values as chips, and each leg picks its own game and market from them, instead of one game and one market for the whole dutch.

Today the form has one Game and one Market box and copies them onto every leg of every bet. A dutch often mixes
games and markets (a player-points prop in one game, a moneyline in another), so the saved legs get the wrong
game and market. The owner currently types "ML / PTS" in Market as a workaround.

- Rename the top fields to "Game(s)" and "Market(s)". Both work the same way: Enter or comma adds the typed value
  as a chip (autocomplete as today, narrowed by sport); Backspace on an empty box removes the last chip.
- Leg table in the form: every leg (own legs and shared legs) gets a Game cell and a Market cell, each a select of
  that field's chips, plus "Other…" to type one (autocomplete).
  - With one chip, every leg defaults to it and the column can stay collapsed (shows the value in grey, click to
    change).
  - With several chips, a leg with nothing picked marks the form invalid ("Pick the game / market for each leg").
  - Quick fill: picking a value on a leg suggests it for the legs below that have nothing picked yet, like the
    book column does.
  - A shared leg's game and market are set once and copied to that leg on every bet.
- Each saved leg stores its own game and market. A solo split uses its leg's game and market.
- History / dashboard: where a bet's legs span more than one game or market, those cells show "2 games" /
  "2 markets" (tooltip lists them), as they already do for several sports.
- Game date stays one field for the whole dutch.
- Autocomplete learns games and markets from legs as today; a typed "A / B" is not split automatically.
- Tests: unit for draft-to-bets with one game and market, two of each (each leg gets its own), shared leg values
  copied to every bet, missing pick with several chips is invalid; e2e: owner's example (Celtics W = ML in one
  game, McCain 25 / Mitchell 30 = PTS), saved legs carry the right game and market.

### BT-9 — Betting Tool clears after "Log as bets"
**In short:** Once a dutch is saved from the "Log dutch as bets" form, the Betting Tool clears, so the logged selections are not left there to be logged twice.

- After a successful save only: clear the selections and the shared legs, exactly like the "Clear all" button
  does today (Total stake and "Round stakes to" are kept). The saved last calculation is cleared with them, so a
  reload does not bring the logged dutch back.
- If the save fails, nothing is cleared (the form stays open with its error, as today).
- Show a short confirmation on the Betting Tool after it clears: "Dutch logged: 2 bets, R$ 100,00 · View in
  History · Undo clear". "Undo clear" puts the calculation back (not the bets: those stay saved), for when the
  same split is wanted again; the message goes away after ~8 s or on the next edit.
- Tests: unit / component for clear-on-success and keep-on-failure; e2e: log a dutch, the rows are empty, stake
  kept, reload stays empty, "Undo clear" restores the rows.
