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


### BT-37 — "Woulda won / woulda lost" on a cashed-out bet
**In short:** On a bet already cashed out, W or L records what would have happened, and the pill and Analytics show what the cash-out left on the table or saved.

Agreed with the owner on 2026-11-24.

- **Data:** a new field of its own on the bet (not the free-text label, so it can be counted): would-have `won` /
  `lost` / empty. Only meaningful when the result is cash-out; cleared if the result is changed to anything else.
- **Input, no new button:** on a selected row whose result is cash-out, **W** sets "woulda won" and **L** sets
  "woulda lost" (today those keys do nothing there); the same key again clears it. Mouse: hovering the Cash-out pill
  shows two small dim "W" / "L" letters that do the same. Z undoes it. Works the same on a cashed-out dutch split
  and rollover bet.
- **Display, alignment first (owner, 2026-11-24: keeping the table aligned is very important):** the Cash-out pill
  keeps exactly today's height and width, and no row gets taller or wider because of this item. The would-have shows
  as a chip in the existing label / result area of the row (same style as the BT-27 label chip, next to a label if
  there is one). Example: stake 100 @ 1.88 cashed out for 145:
  - woulda won: chip `WOULDA WON · LEFT H$ 43,00` in amber. left = profit if won − profit of the cash-out (88 − 45).
  - woulda lost: chip `WOULDA LOST · SAVED H$ 145,00` in green. saved = profit of the cash-out − profit if lost (45 − (−100)).
  - Use the existing profit functions in `src/lib/money.ts` for both sides so bonus-money bets come out right.
  - No "…" cut text. If label + chip do not fit the area, the figure moves to the chip's tooltip (`WOULDA WON`)
    rather than breaking the columns.
- **Not forgotten:** a cash-out with no would-have set shows a faint "?" inside its pill, without changing the pill's size (tooltip: "W / L: what would
  have happened").
- **Analytics:** one "Cash-out verdict" figure: sum of saved − sum of left over the cash-outs in the current filter,
  with the count "n woulda won · n woulda lost · n not set". No cash-outs with a would-have → "-".
- **Not automatic:** never derive it from the free-text actual result ("111-112", "24 pts").
- **Tests:** unit tests for left / saved (real, hypothetical, bonus money); e2e: cash out a bet, W, check the pill
  line, W again clears, L, check Analytics verdict.

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

### BT-39 — Bug: a shot banked from a dutch split shows the split's odds instead of the dutch's real odds
**In short:** A shot started from a won dutch split must count the whole dutch's stake, so it reads 1.39 (not 3.00) and is not marked "already 1.80+ (Shot)".

Reported by the owner on 2026-11-24 with a screenshot: Banked list shows `H$ 139,86 @ 3.00 Shot · 1 bet · already
1.80+ (Shot)`. The dutch staked about H$ 100 in total and its winning split (@ 3.00) returned H$ 139,86, so the real
odds so far are 139,86 / total dutch stake ≈ 1.39: a "semi", still needing about 1.30 to become a shot.

- **Cause (read on 2026-11-24):** `chainSummary` in `src/lib/rollover.ts` multiplies each bet's own odds
  (`factor(b)` returns `b.odds` for a win) and only sees the chain's bets, so the losing splits' stakes of the same
  `dutchId` are ignored.
- **Fix:** when a chain's first bet is a dutch split, that bet's factor is what the split returned ÷ the total stake
  of every bet in its dutch, and the chain's stake is that total. Everything derived follows: odds shown, tier chip
  (mini / semi / Pepsi / shot), `needs`, progress bar, "already 1.80+", the BANKED SHOT chip on the row, and
  `chainAsBet` / Analytics for the closed shot. Check that the dutch + its shot are still counted as one bet and
  that money is not counted twice (dutch money figures stay bet by bet).
- **Tests:** unit: dutch of 2 splits totalling 100, winning split 46,62 @ 3.00 banked → odds 1.40 (139,86 / 100),
  tier semi, needs 1.29 rounded up per `neededOdds`, not "already there"; then a next bet @ 1.30 closes it as a shot.
  A plain (non-dutch) banked bet is unchanged. e2e: bank a won dutch split and read the Banked list line.
