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
- **Pill, second line** (example: stake 100 @ 1.88 cashed out for 145):
  - woulda won: `woulda won · left H$ 43,00` in amber. left = profit if won − profit of the cash-out (88 − 45).
  - woulda lost: `woulda lost · saved H$ 145,00` in green. saved = profit of the cash-out − profit if lost (45 − (−100)).
  - Use the existing profit functions in `src/lib/money.ts` for both sides so bonus-money bets come out right.
  - No "…" cut text: the row may grow taller, as with the current two-line pill.
- **Not forgotten:** a cash-out with no would-have set shows a faint "?" on its pill (tooltip: "W / L: what would
  have happened").
- **Analytics:** one "Cash-out verdict" figure: sum of saved − sum of left over the cash-outs in the current filter,
  with the count "n woulda won · n woulda lost · n not set". No cash-outs with a would-have → "-".
- **Not automatic:** never derive it from the free-text actual result ("111-112", "24 pts").
- **Tests:** unit tests for left / saved (real, hypothetical, bonus money); e2e: cash out a bet, W, check the pill
  line, W again clears, L, check Analytics verdict.
