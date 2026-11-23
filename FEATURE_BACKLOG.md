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

### BT-30 — PP batches: leg pool, tickets, leg-first settling, archive
**In short:** A new "PP" page where a batch is a pool of legs plus the tickets made from them, you settle each leg once and every ticket updates itself, and every batch stays saved to reopen later.

Decided by the owner (2026-11-23):
- PPs live only on the PP page. They never show on the Bets page and never count in the Bets or Analytics totals
  (bet count, wagered, profit, ROI, win rate, pending). The PP page has its own totals.
- PPs are mainly placed with bonus money. Until BT-33 (bonus wallet) is built, a batch's money type is Real or
  Hypothetical, as for bets (BT-14); BT-33 adds Bonus.

Data (new tables, same `CREATE TABLE IF NOT EXISTS` pattern as `src/lib/server/db.ts`; loaded into the client like bets):
- Batch: id, name (default "Batch dd/mm"), placed date, book, stake per ticket, target odds (default 20), money
  type, the scheme used to build it (BT-31), notes, created/updated.
- Batch leg (entered ONCE per batch): sport, game, market, selection, odds (any format, `OddsInput`), tier,
  result (pending / won / lost / void), actual (as BT-27), a short note (his confidence or theory on it).
  Autocomplete on every text field, same as the bet form.
- Ticket (a PP): batch id, number (PP 1, PP 2, ...), its leg ids, placed yes/no, odds override (the book's real
  price, optional).
- Tiers are a per-batch ordered list with names, default: Major-major, Major, PP shot. He can add a level
  (for example "Major 2") or rename one.

Rules:
- Ticket odds = its legs' odds multiplied, shown as "estimated", unless he typed the book's price over it. This is
  a second stated exception to "never multiply legs" (CLAUDE.md): add it there when this ships.
- Ticket result is derived, never typed: lost as soon as one leg is lost; won when every leg is won or void and at
  least one is won; void when all are void; otherwise pending. A void leg drops out and the ticket's estimated odds
  are recalculated without it.
- Ticket status for reading: Alive (no lost leg, legs pending), **One leg away** (alive with exactly one leg
  pending), Won, Dead, Void.

Page (desktop first, no cut text, same row styling and W / L / V look as BT-18 and BT-28):
- Nav gets "PP" after "Dutch tool". The page lists batches newest first, one row each: name, date, tickets
  won / alive / dead, one-leg-away count, staked, returned. Click opens the batch.
- Inside a batch, the main view is the LEG list grouped by tier. Each leg row: selection, game, odds, tier chip,
  "on 34 PPs · 12 alive", note, and W / L / V buttons. Keyboard: arrows move, W / L / V settle, T sets the actual
  and note, Z undoes (same keys as the Bets page). Settling ~30 legs settles ~100 tickets: he never has to touch
  a ticket to enter a result.
- A leg that is the last pending leg of any ticket is flagged "decides 3 PPs" and sorts to the top of its tier.
- Second view, "Tickets": every PP with its legs as chips coloured by result, odds, stake, potential return,
  status. Filter chips: All / Alive / One leg away / Won / Dead. Sort by number, odds, legs left. Clicking a leg
  chip filters to the tickets containing that leg.
- Tickets can also be added and edited by hand (pick legs from the pool) for batches not made with BT-31.
- Reopening an old batch shows exactly the same two views, read-only until "Edit" is pressed.
- Export / Import (BT-3) include batches.

Tests: unit tests for ticket result and status derivation (including void legs and undo), db integration for the
new tables, Playwright for create batch → add legs → add tickets → settle legs by keyboard → tickets update.

### BT-31 — PP builder: scheme helper and ticket generator
**In short:** Enter the legs and their tiers, and the app proposes how many PPs to make and how often each tier appears, then generates all the tickets and gives a checklist for placing them.

Needs BT-30. No AI and no paid service: plain rules and arithmetic.

- Step 1, pool: add legs with tier and odds (the BT-30 leg list in edit mode).
- Step 2, scheme. The app proposes values from the pool and he can change every one of them:
  - number of PPs;
  - target odds per PP (default 20) and the accepted band around it (default 15 to 30);
  - appearances per tier: Major-major = every PP (fixed); each Major level = a share of the PPs (higher level,
    higher share); PP shot = a fixed number of PPs each.
  - Live preview while he edits: legs per PP (min / average / max), estimated odds per PP (min / average / max),
    how many PPs fall outside the band, appearances per leg, total stake and total potential return.
  - The proposal: with the major-majors on every PP, pick the Major shares and PP-shot count so the average PP
    lands on the target odds, and suggest the number of PPs that lets every leg get its appearances. If the pool
    cannot reach the target (too few or too short-priced legs), say so plainly with what is missing.
  - The last batch's scheme is the starting point for the next one. The owner's schemes changed from batch to
    batch, so nothing here is hard-coded. He has NOT given default numbers: start with Majors 50%, PP shots 2 PPs
    each, and treat those as placeholders he will tune.
- Step 3, generate ("semi-random"): every PP starts with the major-majors, then is filled from Majors and PP shots
  by random draw weighted by each leg's remaining appearances, until the PP is inside the odds band. Hard rules:
  a leg at most once per PP, no two identical PPs, every leg reaches its appearances where the numbers allow
  (report any leg that fell short). Toggles, off by default until he says otherwise: "no two legs from the same
  game on one PP", "avoid repeating the same pair of legs". "Shuffle" regenerates; a seed keeps a result
  reproducible for tests.
- Step 4, place: the tickets as a checklist in generation order, each with its legs in a copy-friendly line and a
  "placed" tick (keyboard: Space ticks and moves down), plus an optional box for the book's real odds.

Tests: unit tests for the proposal maths and for the generator's hard rules with fixed seeds (appearances met, no
duplicates, band respected, shortfalls reported); Playwright for pool → scheme → generate → tick placed.

### BT-32 — PP stats: per batch and across batches
**In short:** See what the PP research actually says: how each tier and each leg did, which PPs died by one leg and which leg killed them, per batch and over time.

Needs BT-30.

- Per batch (a "Stats" tab in the batch): tickets won / dead / alive, staked, returned, profit; per tier: legs
  won-lost, hit rate, and next to it the average hit rate the odds implied (1 / odds), so he sees whether his
  confidence tiers beat the price; "Lost by one": PPs whose only lost leg was X, grouped by that leg ("Jokic 12+
  ast killed 9 PPs that were otherwise complete"), with the leg's note and actual shown.
- Across batches (top of the PP page, with a date range): the same per-tier table over all batches, hit rate per
  tier over time (one point per batch), and breakdowns of leg hit rate by sport and by market.
- No settled legs → "-", never NaN (same rule as the rest of the app).
- The owner has not said which other stats he wants: build these, and expect more to be added after he uses it.

Tests: unit tests for every figure, including empty and all-void batches.

### BT-35 — Ladder: let the whole payout ride from one bet to the next, shown as rungs
**In short:** A ladder starts from one stake, puts the whole payout of each win on the next bet (100 → 200 → 400 → ...), and shows as one row with its rungs until it loses or you take the money.

Asked for by the owner on 2026-11-23: "I bet on something odds 2 with 100 and it hits, so now I bet on something
odds 2 with the 200 and it hits, so now it's 400, and it keeps going." He called it a "ladder" (the usual name
for it; keep "Ladder" and "rung" in the UI).

The money mechanic already exists: a rollover chain (BT-29, `src/lib/rollover.ts`, `rolloverId`) is exactly
"whole payout becomes the next bet's fixed stake, one row, first stake wagered, final payout − first stake as
profit". Reuse the chain; do NOT build a second money model. What differs from a rollover shot:

- **Purpose.** A shot chain is patched together to reach odds 1.80 and then stops. A ladder is planned from its
  first bet and has no odds target: it goes on until a loss or until he takes the money. Store the kind on the
  chain (shot / ladder) so the two never get mixed up; existing chains are shots.
- **Starting one.** A "Ladder" choice when adding a bet (form and quick-add) makes that bet rung 1 of a new
  ladder, with an optional goal: a number of rungs or a target amount (either can be left empty). A won plain
  bet can also be turned into rung 1 afterwards ("Start ladder" next to "Bank").
- **Climbing.** When a rung wins, the row offers "+ Next rung" (same as "+ Add leg": whole payout as the fixed
  stake, same money type and book prefilled) and "Take R$ 400,00" (closes it as won at that amount). No Bank step
  in between: a won rung of a ladder is banked automatically. A lost rung ends the ladder: loss = the first stake
  only.
- **Row.** One row, like a rollover, with a rung strip that never cuts text (taller row is fine):
  "R$ 100 → 200 → 400 → next: 800 @ 2.00", each rung with its bet, odds and W / L / V, the current rung
  highlighted, and "rung 3 of 5" or "R$ 400 of R$ 1.600" when a goal was set. Without a goal: "rung 3".
  The Shot / Mini / Semi / Pepsi chip and the "needs 1.13+" text do not show on a ladder.
- **Void / cash-out on a rung.** As a chain already treats them (void multiplies by 1, a cash-out by what it
  returned): the ladder stays alive with that amount as the next stake.
- **Counting.** One bet in counts and win rate, as a rollover: won when closed above the first stake, lost when a
  rung loses, pending while open. Analytics gets a "Ladder" group next to "Rollover" with: ladders started,
  average rungs climbed, best ladder, how many reached their goal, net profit.
- Not confirmed by the owner (Claude's choices, change if he says otherwise): the goal being optional; no partial
  take ("pull R$ 100 out and let the rest ride") in this version; ladders counting in the main totals like any bet.

Tests: unit tests for the ladder kind (outcomes on win / loss / void / cash-out per rung, goal progress, take at a
rung, counts and the Analytics group, shots unaffected); Playwright for start ladder → win → next rung → win →
take → row shows the rungs and profit → Z undoes each step.

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
