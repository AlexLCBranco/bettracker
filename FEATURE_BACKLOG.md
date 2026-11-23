# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-5 — Dutch of combinations: splits with several legs and a shared leg
**In short:** A dutch split can be a combination (e.g. "McCain 25 pts + Celtics W"), with a leg shared by every split typed once, logged as real combination bets, and a dutch where more than one split wins settles correctly.

Owner's example: split 1 = McCain 25 pts (+220) + Celtics W (1,3); split 2 = Mitchell 30 pts (+220) + Celtics W
(1,3). Today each split has to be typed as one name with hand-calculated total odds, is saved as a solo bet, and
the settle number keys assume exactly one split wins.

- Betting Tool, legs per split: each selection row gets "+ leg". A split with 2+ legs shows one line per leg
  (name + odds, any format, same parser and format picker as BT-4).
- Shared legs: a "Shared legs" block above the rows (name + odds, zero or more). Every shared leg is part of
  every split, typed once.
- Total odds per split: a split with legs has a total odds box, prefilled with the product of its legs and the
  shared legs and labelled "estimated"; typing over it (the book's real price for the combination) wins and
  drops the label. The dutch maths uses the total odds box. This is the one place legs are multiplied, only as
  an editable prefill: update the "never multiply legs" rule in CLAUDE.md to say so. A split with no legs and no
  shared legs works exactly as today.
- Log as bets: a split with 2+ legs in all (own + shared) is saved as a combination bet: odds = its total odds,
  legs = its own legs then the shared legs, each with its decimal odds and name as the selection, sport / game /
  market from the shared fields. Bet text = the leg names joined with " + ". A split with one leg stays solo.
  All bets share the `dutchId`, as in BT-4. The log form shows each split's legs under its row.
- Settle, more than one winner: on a dutch, number keys 1-9 now toggle a split between won and lost instead of
  settling at once; Enter confirms (toggled = won, the rest lost). 0 = none won, V = void all and Z = undo stay
  one-key. The hint line on the Settle page says so. A dutch with every split's legs settled the same way in
  History needs no extra step.
- Settle, shared leg: a key (S) for "shared leg lost" on a dutch that has one: every split lost, and that leg is
  marked lost on each bet, so Analytics "which leg lost" is right.
- Leg results: when a combination split is settled won from the queue, its legs are marked won; when lost
  without S, legs stay pending (set them in History if wanted).
- The saved last calculation keeps legs and shared legs; older saved calculations still load.
- Tests: unit for the prefilled total (mixed formats, overwrite wins), draft-to-bets for combination splits
  (leg order, bet text, solo fallback), settle toggle / confirm / S / undo; e2e: the owner's example end to end
  (two splits, one shared leg, log, expand in History to see legs, settle both won with 1, 2, Enter).

### BT-6 — Dutch hit count: "1/2" badge and misses counted once
**In short:** Every settled dutch shows how many splits hit (0/2, 1/2, 2/2) as a coloured badge, and a miss on a leg shared by every split counts as one miss, not one per split.

Builds on BT-5 (splits with legs and shared legs).

- Badge on every dutch row (History, dashboard recent bets, Settle queue once partly settled): "hits/splits",
  e.g. 0/2, 1/2, 2/2, 2/3. Pending splits are left out of the count until settled; while any is pending the badge
  is grey and reads like "1/2 · 1 pending".
- Colours: all hit = bright green, some hit = amber, none hit = red. Void splits are left out of both numbers
  (2 splits with one void and one won = 1/1).
- Misses: below the badge (or in its tooltip, if space is tight) "1 miss" / "2 misses", counted by distinct legs
  that lost, not by splits. A shared leg that lost counts once however many splits it sank. Owner's example:
  McCain 25 + Celtics W and Mitchell 30 + Celtics W, Celtics lose = 0/2 · 1 miss (Celtics W); Celtics win, McCain
  and Mitchell both short = 0/2 · 2 misses; only McCain short = 1/2 · 1 miss.
- Name the missed legs in the tooltip, shared legs marked "shared".
- When a lost split has no leg results set (e.g. lost settled without S, legs left pending), count it as 1 miss
  of its own and say "leg not set" in the tooltip, so the number is never silently wrong.
- Expanded dutch: each split row gets a small hit / miss / void / pending mark, and each leg that lost is
  highlighted red.
- Analytics: add "Dutch hits" to the type = Dutch view: how many dutches ended all hit / some hit / none hit, and
  of the none-hit ones how many were sunk by a shared leg alone.
- Tests: unit for the hit count and miss count (shared leg lost, every own leg lost, mixed, void split, pending
  split, legs not set); e2e: settle the owner's example three ways and check the badge text and colour class.
