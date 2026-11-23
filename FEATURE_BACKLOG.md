# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-29 — Rollover shot: bank a won bet and add a leg later

**In short:** A won bet can be kept open ("banked") so a later bet placed with its whole payout joins it as one shot with the odds multiplied.

Why: the owner wants every shot at 1,80 or more. Sometimes he places part first (say 1,60), it wins, and only later
finds a ~1,20 to put the whole payout on. Today that is logged as two unrelated bets (a 1,60 win and a 1,20 bet), which
is not what happened: it was one 1,92 shot.

Owner's example: R$ 100 @ 1,60 wins → R$ 160 → all R$ 160 on a 1,20 = one shot, R$ 100 @ 1,92, pays R$ 192.

- Model it like a dutch: ordinary bets sharing a new `rolloverId` (each keeps its own book, date, game, odds, legs).
  Each next bet's stake is the previous bet's payout.
- Bank: on a won bet, an action/key "Bank for rollover". A banked bet shows as an open shot: "Banked R$ 160 @ 1,60 ·
  needs 1,13+ to reach 1,80" (target ÷ banked odds, rounded up to 2 decimals). Target is 1,80, in one constant.
- Add leg: "Add leg" on the open shot opens the normal add form with the stake prefilled with the banked payout
  (editable is NOT needed: a different stake is not a rollover). More than two bets in a chain is allowed.
- Close: "Close" on an open shot with no pending bet turns it back into a plain won bet.
- One row in the Bets table, expandable to its bets like a dutch: stake = first bet's stake, odds = product of the
  bets' odds, result = lost if any bet lost, won if all won and it is closed, otherwise pending/open.
  This product is exact arithmetic on separately placed bets, so it does not break "never multiply legs" (that rule
  is about a combination's own total odds).
- Counts as ONE bet in bet count, pending count, wins, losses and win rate (same idea as the dutch rule). Money:
  wagered = the first bet's stake only (the rolled stakes are the same money), net profit = final payout − first
  stake (or −first stake if any bet lost). A banked/open shot counts as pending, and its banked payout is not profit yet.
- A void or cash-out inside a chain: void = that bet's odds count as 1,00; cash-out = the chain ends with the cash-out
  amount as its final payout.
- Tiers by odds, shown as a small chip on a banked bet and on the open shot ("Banked Semi · needs 1,29+ for a Shot"):
  Mini 1,10–1,22 · Semi 1,33–1,50 · Pepsi 1,51–1,79 · Shot 1,80+. Names and ranges live in ONE table in code:
  "Pepsi" is a placeholder the owner expects to rename, and "Major" is reserved for something else (do not use it).
  Odds outside these ranges (under 1,10, and 1,23–1,32, which the owner has not assigned yet) show no chip.
- Every bet in a chain has the first bet's money type (Real or Hypothetical); the added leg inherits it, not editable.
  The owner uses this to simulate his "shots" system with hypothetical money.
- Export / import carry `rolloverId`. Undo (Z) covers bank, add leg and close.
- Tests: unit (chain odds, profit, counts, needed-odds rounding, void/cash-out), e2e (bank → add leg → win; → lose; close).
