# Feature backlog — bettracker

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Item IDs are BT-1, BT-2, ... (never reused; BT is this repo's prefix, unique across the owner's repos).

## Ready

### BT-17 — Combo rows: fix one-leg combos and missing details
**In short:** A Combo row shows its legs, its games and a leg count, like a Dutch row does.
- A Combo with one leg is really a Solo: block saving it as a Combo, or turn it into a Solo.
- Game column: show the legs' games and league (e.g. "NBA"), not the grey "Combination" placeholder.
- Add the ▸ expand arrow so the legs can be opened.
- Type column: "Combo · n" like "Dutch · 2"; show the x/y hit counter like Dutch rows.

### BT-18 — Same styling on every row
**In short:** Rows with the same state look the same.
- Profit (+/-): same size and weight on every row (row with +H$ 87,00 looked smaller than +H$ 99,24).
- Stake: same color on every row (white on Combo, purple on Dutch today).
- Row tint: won rows all get the same background (only the Combo row had a green tint).
- W / L / V buttons: same rule for every row (shown only on hover, or only on unsettled bets), not on one settled row only.

### BT-19 — Dutch result badges: no warning look, no repeats
**In short:** A dutch that won with one split reads as a normal win.
- "1/2 · 1 miss" on a won dutch uses a neutral/green style, not amber.
- Lost dutch: drop the repeat ("Lost" + "0/2" + "2 misses" says the same thing three times); keep one.
- Drop the purple "Dutch" chip in the Bet column; the Type column already says "Dutch · 2".

### BT-20 — Consistent text: names, units, games, odds
**In short:** Saved text is written the same way everywhere.
- Autocomplete keeps proper name casing ("McCain", not "Mccain").
- Stat units in one form ("pts", not "PTS" on one bet and "pts" on another).
- One game format for every bet ("Celtics @ Warriors" vs "Celtics vs Knicks" today).
- Shown odds match the payout: 1.99 shown with +99.24 profit means real odds ~1.9924; show enough decimals (or round the payout the same way).
- Truncated game/bet text: full text visible on hover.

### BT-21 — Date column: no repeated date
**In short:** Show "game dd/mm" under the bet date only when it differs from the bet date.

### BT-22 — Warn when a team plays twice on one day
**In short:** Saving a bet whose games put the same team in two games on the same date shows a warning (e.g. Celtics vs Warriors and Celtics vs Knicks both on 22/11).
