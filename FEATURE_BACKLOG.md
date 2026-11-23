# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-10 — One-click settle buttons on a dutch row
**In short:** A pending dutch row in History and on the dashboard gets quick settle buttons (0 wins, all win, which ones won, shared leg lost, void), like the W / L / V buttons on a single bet.

Today a dutch row only has Duplicate and Delete; settling it means the Settle page or expanding it and settling
each bet.

- Buttons on the dutch row's Actions cell while any of its bets is pending, in this order:
  - "0 W": every split lost.
  - "All W": every split won.
  - "Pick W…" (only with 2+ splits): a small popover listing the splits (name + odds) with a checkbox each; Enter
    or "Save" = checked won, the rest lost. With exactly 2 splits, skip the checkboxes: the popover is two buttons,
    one per split ("McCain 25 pts + Celtics W won"), one click settles.
  - "Shared ✕" (only when the dutch has a shared leg): every split lost, the shared leg marked lost on each bet
    (same as S on the Settle page).
  - "V": void all.
- Same results, leg marking and single-step undo as the Settle page actions (BT-5 / BT-6): reuse those functions,
  don't write a second copy. After a click, show "Undo" in place of the buttons for ~8 s; Z on the page also
  undoes.
- Colours and size match the W / L / V buttons on single bets; tooltips spell out each one.
- The badge (BT-6) updates straight away.
- Settled dutch: buttons hidden, as on a settled single bet; changes go through expanding the row, as today.
- Tests: unit for each action on 2 and 3 splits (with and without shared leg), undo; e2e: settle the owner's
  example with "Pick W…" choosing one split, badge shows 1/2, undo, then "Shared ✕", badge shows 0/2 · 1 miss.

### BT-11 — Fix: live e2e tests leave a bet behind
**In short:** The live test run left a bet "e2e-… edit me" (dated 01/01/2000) in the real History; every live test must delete what it creates, even when it fails.

- Seen on 2026-11-22 in the owner's History: "e2e-mwskca2engub edit me", 01/01/2000, Old Book, R$ 50,00, 2.00,
  Solo, Pending.
- Find the test that creates the "edit me" bet and why its cleanup did not run (failed before cleanup, renamed bet
  no longer matched the cleanup filter, or cleanup by text instead of id).
- Cleanup must run in `afterEach` / `afterAll` (or a fixture teardown), by id, whether the test passed or failed;
  plus a final sweep that deletes every bet (and dutch) whose text starts with "e2e-" or whose dates are
  2000-01-0x, so leftovers from older runs are removed too.
- Add a check at the end of the live run that fails if any e2e bet remains.
