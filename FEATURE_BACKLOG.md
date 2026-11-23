# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

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

## Waiting on the owner (do not build yet)

### BT-33 — Bonus money: a wallet per book and a third money type
**In short:** Log a bonus once per book, see at all times how much bonus you have on hand, and have bets and PP batches placed with bonus spend it and pay their winnings into real money.

Proposed by Claude on 2026-11-23 after the owner asked for "a clever way of inserting bonus money" and to see
"the full value I have on me". He has NOT confirmed this design yet. Open points:
1. On a won bonus bet, is the payout winnings only (stake 10 @ 20 pays 190) or stake included (pays 200)?
   Written below as a setting on each grant because it may differ by book.
2. Does "the full value I have on me" mean bonus on hand (as written below) or his whole bankroll, real included?

- Money gets a third value, Bonus, next to Real (R$) and Hypothetical (H$) (BT-14), with its own colour and symbol.
- Grant: book, amount, date received, optional expiry date, "stake returned on a win: yes / no" (remembered per
  book), optional note. Added from one small form; the book field autocompletes.
- Balance per book = grants - stakes of bonus bets and bonus PP tickets placed at that book. The top bar shows the
  total bonus on hand; hover or click lists each book with its balance and nearest expiry. An expired grant's
  unspent part drops out of the balance and is listed as "expired unused".
- A bet or PP batch marked Bonus spends from its book's balance; the form shows the balance and what will be left,
  and warns (does not block) when the stake is more than the balance.
- Maths (`src/lib/money.ts`): a lost bonus bet is R$ 0 profit and counts R$ 0 in real "wagered"; a won bonus bet
  adds its payout (per the grant's stake-returned setting) to REAL profit. Real ROI therefore ignores bonus
  stakes. A separate figure, "bonus converted" = real money won from bonus / bonus spent, shows per book, per PP
  batch and overall.
- The Real / Hypothetical / Both switch gains Bonus. Export / Import (BT-3) include grants.

Tests: unit tests for balance, expiry and both payout settings; db integration; Playwright for grant → bonus bet
→ balance drops → win pays into real profit.
