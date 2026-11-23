# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

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
