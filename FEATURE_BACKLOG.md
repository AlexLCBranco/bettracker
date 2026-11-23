# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-12 — Edit a logged dutch as a whole
**In short:** A dutch can be edited after it is logged, like single bets already can.
Single bets already have Edit (pencil + inline cells), but a dutch row only has settle, Duplicate and Delete: there is no way to fix a dutch after logging it.
- Add Edit on the dutch row that opens the dutch log form (same as the Betting Tool's "Log as bets" form) prefilled with the saved dutch: splits, legs, shared legs, odds, stakes, games, markets, book, dates.
- Saving updates the existing bets in place (same dutchId, results kept where the split still exists); adding/removing a split adds/removes its bet.
- Every field of every logged bet (solo, combination, dutch split, legs) must be editable somewhere; audit and close any gaps found.
- Tests: edit a dutch (change odds, stake, add a split, remove a split) and check History, dashboard and Analytics totals.

### BT-13 — Clearer wins and losses (red/green), especially dutches
**In short:** Wins show green and losses red everywhere, so a dutch or combination reads at a glance.
The UI is not clear enough at a glance. Make results readable without reading text:
- Green for won / profit, red for lost / loss, consistent everywhere (rows, Plus/Minus, badges, legs, charts); grey/neutral for pending and void, amber for partial (half-won, half-lost, some splits hit).
- Dutch rows: tint or left border of the whole row by outcome; when expanded, each split and each leg marked green/red, the lost leg (or lost shared leg) clearly the one in red; net profit of the dutch big and coloured.
- Combinations: show which leg killed it at a glance.
- Do not rely on colour alone (icons ✓/✕ or signs) so it still reads in screenshots/greyscale.
- General pass on dutch display clarity (owner: "the whole system has to be clearer"); propose the layout in the PR description.

### BT-14 — Hypothetical money (paper bets)
**In short:** Bets can be logged with hypothetical money (H$) that never mixes into real totals.
Option to log bets with hypothetical money instead of real money, so he can track picks he didn't actually place.
- A per-bet "money" choice: real (R$) or hypothetical, shown as "hypothetical dollars" with its own symbol (e.g. H$) so it's obvious and a bit funny.
- Available in quick-add, the full form and the Betting Tool dutch log; remembered as last-used like book/sport.
- Hypothetical bets never mix into real totals: dashboard, Analytics and charts get a Real / Hypothetical / Both switch (default Real); History filter for it.
- Export/import keep the flag.
