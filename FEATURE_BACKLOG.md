# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

**Build order when building everything in one go** (owner, 2026-11-23): BT-34, BT-33, BT-30, BT-31, BT-32, BT-35,
BT-36. One item at a time: finish it, tests green, version bump, moved to `BUILT.md` and committed before starting
the next. With this order BT-30 gets Bonus money from the start and BT-36 includes its "Start this ladder" part.

BT-30 to BT-32 are one feature, the "PP system", written up from a conversation on 2026-11-23.
Build order: BT-30, BT-31, BT-32.

Words the owner uses (keep them in the UI):
- **PP**: one combination ticket aiming at total odds of about 20, placed with bonus money. (What the letters stand
  for was never said: do not expand them.)
- **Batch**: a set of PPs built and placed together from one pool of legs. He ran several batches a week, with
  about 100 PPs open at once.
- **Tiers** of legs inside a batch, by his confidence: **Major-major** (the no-brainer, around odds 2, on every PP),
  **Major** (next best, on many PPs; majors can have more than one level), **PP shot** (third tier, on a fixed
  small number of PPs).
- Why it exists: research, not profit. Every opinion gets a spot, and the results show whether what he believes
  works in volume. Before, it was done in Excalidraw with AIs inventing the scheme per batch, the history lived only
  in the bookmaker's app and vanished, and both building and following 100 PPs was the part that broke.


### BT-38 — Units: type a stake as money or as units ("1u"), and view everything in units
**In short:** A stake can be typed as `100` or `1u`, each money type has a unit size, and a money / units toggle shows stakes, profit and Analytics in units.

Agreed with the owner on 2026-11-24.

- **Alignment is the first rule (owner: "maintaining alignment is very important"):** nothing in this item may move
  a column, change a column's width or change a row's height. Money view and units view use the same fixed-width,
  right-aligned, tabular-number columns, so toggling never shifts the table. The typing preview appears in a spot
  that already exists (or overlays), never pushing fields around. No "…" cut text.
- **Input:** anywhere a stake is typed (quick-add line, bet form, Betting Tool, cash-out box amount), a number with
  a `u` suffix is units: `1u`, `0,5u`, `2.5u` (comma or dot, upper or lower case). A plain number stays money, as
  today. Money prefixes still work together with it (`H$` / `B$` / `R$` choose the money type; `H$1u` is allowed but
  not required). Before Enter a preview shows the conversion: `1,5u = H$ 150,00`.
- **Unit size:** a fixed amount set by the owner, one per money type (real, bonus, hypothetical), on the Bankroll
  page. Not a percentage of the bankroll. Typing `u` with no unit size set for that money type → a clear inline
  message pointing to the setting, the bet is not saved.
- **Stored per bet:** the stake in money (as today) plus the unit size in force when the bet was placed. A bet typed
  as `100` with unit size 100 is 1u too. Changing the unit size later never rewrites old bets.
- **Older bets** (placed before a unit size existed) have no unit size: in units view they keep showing money. When
  the first unit size is set, offer once to apply it to all older bets of that money type.
- **Display:** a money / units toggle (key **U**, also a visible control, remembered). In units view stake, profit,
  cash-out amount and the BT-37 left / saved figures show as `1u`, `+0,45u`, `1,45u` (up to 2 decimals, trailing
  zeros dropped). Analytics follows the toggle (net profit `+12,3u`, wagered in units); ROI and win rate do not change.
  Units of different money types are never added together, same as money today.
- **Tests:** unit tests for parsing (`1u`, `0,5u`, `H$2u`, plain numbers unchanged, text like "25 pts" untouched)
  and for units of old / new bets after a unit-size change; e2e: set a unit size, quick-add with `1,5u`, check the
  saved stake, toggle U and check the row and Analytics; a Playwright check that column x-positions and row height
  are identical in money view and units view.
