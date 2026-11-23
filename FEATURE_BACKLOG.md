# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-23 — Bet History redesign: clearer and prettier

**In short:** The bet table shows one clear win/loss signal per row, groups bets by day, gives the game and bet text room, and makes dutch splits read as parts of one bet.

Applies everywhere `BetTable` is used (home, /history). Files: `src/components/BetTable.tsx`, `HitBadge.tsx`, `components/tone.ts`, `lib/hits.ts` as needed.

1. **One win/loss signal per row, not five.** Keep: thin left edge bar + Result pill + coloured +/- amount. Remove the full-row tint (`TONE_TINT`) on parent rows and the separate ✓/✕ `Sign`. The pill text (Won/Lost/Void/Pending/Cash-out) keeps it readable without colour (BT-13 still holds).
2. **Result column = one pill + at most one muted sub-line, same wording everywhere:**
   - Dutch: "1 of 2 splits hit"
   - Combo won/pending: "2 of 3 legs hit" (only when at least one leg is settled)
   - Combo lost: "lost by Celtics ML" (moves here from the Bet column; no pending count once lost)
   - Remove the "1/2" chip, the "1 miss" line, the "✓ HIT" / "✕ MISS" tags and the "0/1 · 1 pending" chip. Per-leg / per-split detail lives in the expanded rows and a tooltip.
3. **Group by day instead of a Date column.** Remove the Date column; add a full-width day header row: "Sun, 22 Nov" on the left, "5 bets · +H$ 185,48" on the right (net per money scope, H$ in violet). Year only when not the current year. A game date different from the bet date shows as a small muted "game 23 Nov" line under Game. Both dates stay editable (form via ✎, and clicking the game-date line).
4. **Width goes to the text columns.** Game and Bet flex to fill the remaining width (still truncate with full text on hover at 1366px). Stake, Odds, +/- are fixed and narrow, tabular-nums, right-aligned. Multi-game combos show "Celtics @ Warriors +1" (chip, tooltip lists all) instead of "Celtics@Warriors / N…". Games shown as "Away @ Home" with spaces.
5. **Missing game:** muted "no game" instead of "-".
6. **Dutch hierarchy:**
   - Parent row: semibold Bet text; chevron with a hit area of at least 24px that rotates on expand.
   - Split rows: indented with a vertical connector line from the parent, slightly smaller text, no tint, labelled "Split 1", "Split 2" before the bet text; Book/Type/Situation hidden when equal to the parent's; own stake/odds/+/-/result kept.
   - Combo leg rows: same connector style.
7. **Type column:** "Combo ×2" / "Dutch ×2" / "Solo" in plain text; Situation only when Live, as a small red "LIVE" tag (pregame is the default, no label).
8. **Polish:** rows about 44px tall; header labels small, muted, sentence case, sticky; Book in zinc-400; actions (✎, ⋯) visible on row hover and keyboard focus only; W/L/V always visible on pending rows.
9. **Tests (automated, no manual checks):** update vitest + Playwright for the new markup; add Playwright checks for one pill per row, the sub-line wording (dutch, combo, lost combo), day header totals, no Date column, hidden fields on split rows, and no horizontal scroll at 1366px. Save a 1366px screenshot of the Bet History for the owner to eyeball.

