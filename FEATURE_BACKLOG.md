# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-27 — Label chip and actual results on a bet
**In short:** Tag a bet with a short label ("LOST BY ONE") and record what actually happened on each leg ("11", "111-112"), entered with one key and shown on the row without breaking alignment.

**Data**
- `Bet.label: string` (one label per bet, free text, shown uppercase; empty = none).
- `Leg.actual: string` (what happened on that leg: a stat line or a score; empty = none).
- Migration: existing bets get empty values. Include both in export/import.

**Entering**
- A key on the selected row (pick a free one, e.g. `T`; N, W, L, V, C, H, J, Z and arrows are taken) opens a small inline editor on that row. Also reachable by mouse (a faint "+ label / result" on row hover) and in the full form.
- Solo bet: one line, `24 pts #lost by one`. Plain text = the leg's actual, text after `#` = the label.
- Combination: one small field per leg (labelled with the leg's selection) plus a label field.
- Label field: autocomplete like every other field (recent labels on focus, match-anywhere filter).
- Enter saves, Esc closes without saving. The editor never opens on its own: settling with W / L / V stays exactly as fast as today.
- Dutch: a label typed on the dutch row is written to every split of that dutch. A split can still get its own label on its own row. A leg shared by several splits (same game + selection, e.g. "Celtics ML" in both) is typed once: saving its actual on one split fills the same leg on the other splits of that dutch.

**Showing**
- Label: a small uppercase chip on the first line, right after the bet text (after "Dutch ×n" on a dutch row when all its splits share the label). Never in the grey sub-line.
- Actuals, solo: muted, right after the bet text: `McCain 25+ pts → 24 pts`.
- Actuals, combination (and each dutch split): they replace the red "lost by …" text. On its own line under the sub-line, one entry per losing leg: `✗ Jokic 12 ass 11 · ✗ Celtics ML 111-112` (a losing leg with no actual still shows as `✗ Celtics ML`). Legs that hit show their actual only in the expanded legs list. This line wraps instead of cutting with "…".
- The line exists only when there is something to show: rows with no label and no actuals look exactly as they do today (no reserved space).

**Alignment (hard requirement: the owner says changes like this usually break it)**
- Stake, Odds, +/- and Result columns keep the same x position on every row type (solo, combination, dutch parent, split), with and without a label and actuals.
- The new results line starts at the same left edge as the sub-line of its row (nested splits keep their indent).
- The chip sits on the bet text's baseline and does not change the first line's height; if text + chip do not fit, the chip wraps to the next line as a whole, never cut.
- Result pill, numbers and action buttons stay top-aligned with the first line when the row grows taller.
- Automated: extend the BT-26 Playwright alignment test (bets table at each width) with rows that have a label, actuals, both, and a dutch with both, asserting the column positions match rows without them, no "…" on the new line, and no sideways scroll.

**Fix in the same item (seen on the live site 2026-11-23, cause not traced)**
- The "lost by" text reads "lost by Celtics ML ML / pts / ASS": the market string is glued onto the leg name. Show the selection only.
- A dutch split whose other leg also lost listed only one losing leg; a second dutch (lost, 0 of 2 splits) showed no "lost by" text at all. Find out whether the legs' results are not being set when a split is settled as lost, and fix so every losing leg is listed.

**Later (not in this item)**
- Filter the bets page by label; a per-label breakdown in Analytics.
