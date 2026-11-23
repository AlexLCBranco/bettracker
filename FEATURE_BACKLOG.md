# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-28 — Leg results: one-click W / L / V, and legs, splits and dutch always agree
**In short:** Pending legs get the same W / L / V click buttons as bet rows, and a leg's result and its bet's result can never contradict each other (today a split shows "Lost" while both its legs still say "Pending").

Now (v0.19.0): a leg's result is a dropdown behind a double click (`Cell kind="select"` in `BetTable.tsx`), and `saveLeg` saves only the leg, so nothing above it changes; settling a bet as lost leaves its legs as they were (`settle.ts`).

1. Click to settle a leg: a pending leg row shows W / L / V buttons like unsettled bet rows (BT-18); one click sets it. A settled leg shows its result; clicking the result brings the buttons back to change it. Goes through the page's undo (Z).
2. Leg → up:
   - A leg lost → its bet (combination or split) is lost.
   - Every leg won → the bet is won.
   - The leg is a shared leg of a dutch (same selection on other splits) → the same result is set on that leg on every split; if lost, every split is lost, so the dutch is lost.
   - A leg void → the bet stays as it is (its odds change, the owner settles it).
3. Bet → down:
   - Bet won → every leg won (already done for combinations).
   - Bet lost, no leg marked lost yet → its legs stop saying "Pending": they show "?" with the W / L buttons, so the owner can click the one that lost. Legs already known from other splits are filled in (BT-27 `withKnownLegs`).
   - Bet set back to pending → its legs go back to pending.
4. Changing a leg on a bet that is already settled re-runs rule 2 (e.g. the lost leg changed to won and all legs won → the bet becomes won), in one undo step.
5. Existing data: a one-time pass applies rule 3 to bets already logged, so no settled bet shows a "Pending" leg.

Tests: unit tests for each rule in `settle.ts` (including shared leg across splits and undo); e2e: click L on a shared leg of a dutch → every split and the dutch read Lost; settle a split lost → its legs show "?", not "Pending".
