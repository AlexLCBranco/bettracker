# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-4 — Dutch bets: log a dutch from the Betting Tool and track it as one group
**In short:** A dutch calculated in the Betting Tool can be logged as linked bets in one go, and History, Settle and the stats treat the group as one bet.

Approach: no new bet type. A dutch is several ordinary solo bets that share a group ID. `Bet.type` stays
`solo` / `combination`.

- Data: new nullable `dutchId` on bets (column `dutch_id`, added to existing databases too, since the schema is
  only `CREATE TABLE IF NOT EXISTS` today). Every bet of one dutch has the same `dutchId`; null = not a dutch.
  Include it in the API, validation, Export JSON, Export CSV and Import JSON (old exports without it still import).
- Entry: a "Log as bets" button on the Betting Tool, enabled only when the calculation is valid. It opens one
  small form: shared fields once (sport, game, market, placed date, game date, situation; same defaults and
  autocomplete as the full form) and one row per selection showing its name, odds and computed stake, with a
  book per row (first row defaults to the last-used book, the others copy the row above until changed). Saving
  creates one solo bet per selection (stake and odds from the calculator, selection = the row's name, one leg
  each), all with the same new `dutchId`, result pending.
- History and the dashboard's recent bets: a dutch shows as one expandable row (label "Dutch", total stake,
  combined odds = 1 / sum of 1/odds, net profit, result), expanding to its bets the way combination legs expand
  today. Each bet inside stays editable inline. Filters match a group when any of its bets matches. Delete and
  Duplicate on the group row act on the whole group (Duplicate gives the copies a new `dutchId`).
- Settle queue: a dutch is one item. Number keys 1-9 pick the selection that won: that bet becomes won and the
  others lost. 0 = none won (all lost). V = void all. Z undoes the whole group in one step. For anything else
  (cash-out, half results) the bets can still be settled one by one from History.
- Stats (dashboard and Analytics): money figures are unchanged, bet by bet (net profit, ROI, wagered, pending
  amount, and the by-book / by-sport / by-market breakdowns). Counts treat a dutch as ONE bet: bet count, pending
  count, wins, losses and win rate. A settled dutch is a win when its net profit is above 0, a loss when below 0,
  and neither at exactly 0; it is pending while any of its bets is pending. Update the win-rate rule in CLAUDE.md
  to say so.
- Analytics "by type" gets a third value, Dutch (derived from `dutchId`, not stored in `type`).
- Tests: unit for the group win/loss rule and counts (incl. net profit exactly 0 and partly pending), the settle
  group actions and undo, export/import round trip with `dutchId`; db integration for the new column on an
  existing database; e2e: calculate, log as bets, see one group row, settle with a number key, check the stats.
