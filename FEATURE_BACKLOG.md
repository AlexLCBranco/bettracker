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

### BT-40 — Betting Tool: target odds mode for a dutch
**In short:** In the Betting Tool, type the odds you already have and the combined odds you want, and it tells you what odds the missing split needs.

From the owner, 2026-11-24. Today he asks an AI things like "I have a +280 first leg and want a full dutching split
with total odds of about 1.6, what do I need on the second leg". The tool should answer that.

- Where: a "Target odds" mode on the Betting Tool page (`src/app/(app)/betting-tool`), next to the normal dutch
  calculator, not a new page. Maths goes in `src/lib/dutching.ts` beside `dutch()`.
- Inputs: the total odds of every split already known (any odds format, same `OddsInput` as the rest of the tool;
  a combination split counts by its total odds box), the target combined odds, and the total stake (optional).
  Exactly one split is left with empty odds: that is the one being solved.
- Maths (equal-return dutch): `1/target = sum of 1/odds of all splits`. So the missing split needs
  `1 / (1/target − sum of 1/known odds)`. Stake share of a split = `target / its odds`.
  Check: known 3.80 (+280), target 1.6 → needed 2.76 (+176); on 100 total the stakes are 42.11 and 57.89,
  return 160 either way.
- Output: the needed odds in decimal and American at once, and, when a total stake is typed, the stake per split and
  the equal return. Updates as he types, no button.
- "What I found" box on the missing split: he types the odds the book really offers; the tool then shows the real
  combined odds next to the target (above or below it) and the stakes for those real odds.
- Impossible target: when `1/target − sum of 1/known odds` is zero or negative (e.g. target 3.8 or more with a 3.80
  split), show a plain message with the highest combined odds the known splits allow (anything below that limit
  works). Never a negative number, NaN or Infinity.
- Hand-off: one button turns the result into the normal dutch form, with the splits, odds (the "what I found" odds
  when typed, otherwise the needed odds) and total stake filled in, so it can be saved as a dutch as today.
- Table alignment and no "…" cut text, as in the rest of the tool.
- Tests: unit tests for the solver (the check above, three splits with one missing, the impossible case, American
  and decimal input mixed); one e2e that types the example and reads 2.76 / +176 and the two stakes.

### BT-41 — Analytics: dutch split stats
**In short:** A "Dutches" block on the Analytics page showing how his dutches do as a whole and which of their splits are the ones that hit.

From the owner, 2026-11-24: "add dutching split stats to the analytics page". He gave no list of numbers; the
figures below are the session's reading of it, to be corrected by him. Analytics already has the "Dutch hits"
tiles (all / some / none hit, sunk by a shared leg alone, `dutchHitReport` in `src/lib/hits.ts`): keep them, and put
them inside this block rather than building them again.

- Where: one "Dutches" section on `src/app/(app)/analytics/page.tsx`, following the page's date / filter scope like
  every other section. New maths in `src/lib/hits.ts` or a new `src/lib/dutchStats.ts`, unit tested.
- Money tiles (settled dutches only, a dutch counted as ONE bet by the existing rule): dutches, wagered, net profit,
  ROI, win rate, average combined odds. Combined odds of a dutch = `1 / sum of (1 / split odds)`, with the split's
  total odds for a combination split.
- Split record: settled splits that hit / missed (void left out), with hit rate, using `splitMark`.
- "Which split hits" table, one row per position by odds inside its dutch: lowest-odds split, middle splits,
  highest-odds split. Columns: splits, hit, hit rate, average odds, net profit of the dutches where that split hit.
  Splits with equal odds share the lower position.
- "By number of splits" table: 2, 3, 4+. Columns as the page's breakdown table (bets, wagered, profit, ROI, win
  rate), a dutch as one bet.
- "By combined odds" table with the page's existing odds ranges (`src/lib/analytics.ts`), same columns.
- No settled dutches → the block shows one "No settled dutches yet" line; ratios with nothing behind them show "-",
  never NaN. Table alignment and no "…" cut text, as elsewhere.
- Tests: unit tests for the combined odds, the position rule (ties, two-split dutch has no middle row) and the empty
  case; one e2e that logs two throwaway dutches, settles them and reads the tiles.
