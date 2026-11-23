// BT-14: which money the totals count. Real and hypothetical bets never mix unless "Both" is picked.
import type { MoneyScope } from './money';
import type { Bet } from './types';

export const MONEY_SCOPES: MoneyScope[] = ['real', 'hypothetical', 'both'];
export const MONEY_SCOPE_LABEL: Record<MoneyScope, string> = { real: 'Real R$', hypothetical: 'Hypothetical H$', both: 'Both' };

/** The bets a scope counts (a dutch's bets share one money, so dutches stay whole). */
export const byMoney = (bets: Bet[], scope: MoneyScope): Bet[] => (scope === 'both' ? bets : bets.filter((b) => b.money === scope));

export const isMoneyScope = (v: unknown): v is MoneyScope => v === 'real' || v === 'hypothetical' || v === 'both';
