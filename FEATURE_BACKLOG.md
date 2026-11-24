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

### BT-36 — Ladder simulator: plan a ladder rung by rung before betting it
**In short:** A new "Ladder sim" page where you type a starting stake, odds and number of rungs and see what the money becomes at every rung, with different odds per rung, the chance of getting there, and a button that starts the real ladder.

Asked for by the owner on 2026-11-23. Baseline he uses today: https://level-up-doubler.lovable.app/ ("Ladder
Calculator"). It has three inputs (Starting Number, Multiplier, Number of Levels), then one tall card per level
(LVL 0 = the start) showing the value, the sum behind it ("193 × 1.9"), a "×3,61" badge of total growth so far
and a free-text description box, and at the bottom "Total Growth 613,107× · From 193 to 118.329,579".
The baseline is the minimum bar, NOT a layout to copy: the result must do everything it does and be better. Where
it is weak: one multiplier for every level, three decimals on money, a card so tall that 11 levels need a lot of
scrolling, no idea of how likely any of it is, typed descriptions are lost on reload, and nothing connects it to
real bets.

Independent of BT-35 (can be built first). Only the last bullet needs BT-35.

- New page `/ladder-sim`, nav label "Ladder sim" after "Dutch tool".
- Top line, three inputs as in the baseline: Start (money, default 100), Odds (default 2.00, accepts every odds
  format the app already accepts) and Rungs (default 10, 1 to 30). Everything recalculates as you type.
- The ladder is ONE compact table, all rungs visible without scrolling at 10 rungs on a desktop screen, one line
  per rung, columns: Rung · Odds · Stake in · Pays · Profit vs start · Total odds · Chance · Note.
  - Rung 0 is the start row (the baseline's LVL 0).
  - **Odds is editable per rung.** A rung left alone follows the top Odds box (shown dimmed); typing in a rung
    overrides only that rung (shown bright, with a small reset "x"). Changing the top box never wipes overrides.
    The odds tier chip (Mini / Semi / Pepsi / Shot, `tierOf` in `src/lib/rollover.ts`) shows beside each rung's odds.
  - Money with 2 decimals and the app's formatting (R$ 1.323,79), never 3 decimals. Total odds as "×6.86".
  - Chance = chance of reaching that rung if every bet is fair at its odds: product of 1/odds, shown as "14.6%"
    and, under 1%, also "1 in 613". Column header tooltip: "If the odds are fair. Real odds include the book's
    margin, so the true chance is a bit lower."
  - Note = the baseline's description box, one line, grows to fit (no cut text).
  - A thin bar behind each row grows with the amount on a log scale, so the climb is visible at a glance.
- Goal box (optional): "Target R$ ___" marks the first rung that reaches it ("reached at rung 4") and dims the
  rungs after it; and the reverse helper "odds per rung needed to reach the target in N rungs" (Nth root).
- Summary line under the table (the baseline's Total Growth): "R$ 100,00 → R$ 102.400,00 · ×1024 · 10 wins in a
  row · chance 0.10% (1 in 1024)".
- "Try it" button: plays the ladder once with random results at the fair chances, marking rungs W until the
  first L, with "Again" and a running tally ("12 tries: best rung 4, reached the goal 0 times"). Clearly labelled
  as random, not a prediction.
- The whole plan (inputs, per-rung odds, notes, goal) is kept in the browser (localStorage) and survives reload;
  "Reset" clears it. Money symbol follows a Real / Hypothetical toggle like bets (BT-14).
- Once BT-35 exists: "Start this ladder" opens the add-bet form as rung 1 of a new ladder with the stake and
  odds of rung 1 and the plan's rung count or target as its goal; and an open ladder's row gets "Open in sim",
  which loads its real rungs (won ones locked) so the remaining rungs can be planned.

Tests: unit tests for the ladder maths (per-rung override, totals, chance, target rung, needed odds, rounding to
2 decimals); Playwright for type start / odds / rungs → table values → override one rung → totals change → note
and plan survive reload → Reset.
