import type { Money } from '@/lib/types';

/** How each money type looks: H$ violet (BT-14), B$ amber (BT-33), R$ plain. */
export const MONEY_TEXT: Record<Money, string> = { real: '', bonus: 'text-amber-300', hypothetical: 'text-violet-300' };
export const MONEY_OPTION_LABEL: Record<Money, string> = { real: 'Real (R$)', bonus: 'Bonus (B$)', hypothetical: 'Hypothetical (H$)' };
export const MONEY_TITLE: Record<Money, string> = {
  real: 'Real money',
  bonus: "Bonus money: the book's bonus. A loss costs no real money; a win pays the winnings only, as real money.",
  hypothetical: 'Hypothetical dollars: a pick you track but did not place. Never counted with real money.',
};
