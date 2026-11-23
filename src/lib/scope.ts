// BT-14: which money the totals count. Real and hypothetical bets never mix unless "All" is picked.
// BT-33: a bonus bet's winnings are real money, so Real counts bonus bets too (their stakes are not real "wagered",
// src/lib/stats.ts); Bonus shows the bonus bets alone.
import type { MoneyScope } from './money';
import type { Bet } from './types';

export const MONEY_SCOPES: MoneyScope[] = ['real', 'bonus', 'hypothetical', 'both'];
export const MONEY_SCOPE_LABEL: Record<MoneyScope, string> = { real: 'Real R$', bonus: 'Bonus B$', hypothetical: 'Hypothetical H$', both: 'All' };

/** The bets a scope counts (a dutch's bets share one money, so dutches stay whole). */
export const byMoney = (bets: Bet[], scope: MoneyScope): Bet[] =>
  scope === 'both' ? bets : bets.filter((b) => b.money === scope || (scope === 'real' && b.money === 'bonus'));

export const isMoneyScope = (v: unknown): v is MoneyScope => v === 'real' || v === 'bonus' || v === 'hypothetical' || v === 'both';
