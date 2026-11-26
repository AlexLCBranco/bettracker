// BT-66: a click on an Analytics row opens the Bets page filtered to exactly that row's bets. The filter lives in the
// address (/?sport=Basketball, /?odds=Semi, /?nb=nb, /?label=trap, /?dutchSplits=3, /?bet=<id>) and selects with the
// same grouping function the Analytics row used, so the Bets page counts what the row counted.

import { DIMENSION_LABEL, DIMENSIONS, groupKeyFn, inGroup, ODDS_BANDS, type Dimension } from './analytics';
import { normalize } from './autocomplete';
import { withWholeGroups } from './dutch';
import { dutchGroupKeys } from './dutchStats';
import { collapseRollovers } from './rollover';
import type { Bet } from './types';

export type GroupKind = Dimension | 'dutchSplits' | 'dutchOdds' | 'bet';

export interface GroupFilter {
  kind: GroupKind;
  key: string;
}

/** The address parameter of each kind. */
export const GROUP_PARAM: Record<GroupKind, string> = {
  sport: 'sport',
  book: 'book',
  market: 'market',
  odds: 'odds',
  type: 'type',
  situation: 'situation',
  noBrainer: 'nb',
  label: 'label',
  dutchSplits: 'dutchSplits',
  dutchOdds: 'dutchOdds',
  bet: 'bet',
};
const KINDS = Object.keys(GROUP_PARAM) as GroupKind[];
const TEXT_KINDS = new Set<GroupKind>(['sport', 'book', 'market', 'label']);

export const GROUP_LABEL: Record<GroupKind, string> = { ...DIMENSION_LABEL, dutchSplits: 'Dutch splits', dutchOdds: 'Dutch odds', bet: 'Bet' };

// the "Not set" / "Mixed" / "No label" keys start with \u0000: written "~not-set" in the address
const encodeKey = (k: string) => k.replace(/^\u0000/, '~');
const decodeKey = (k: string) => k.replace(/^~/, '\u0000');

/** The Bets page address for some group filters (the period and money scope carry over by themselves). */
export function groupHref(groups: GroupFilter[]): string {
  const q = new URLSearchParams();
  for (const g of groups) q.set(GROUP_PARAM[g.kind], encodeKey(g.key));
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

/** The group filters in an address. */
export function parseGroups(params: Pick<URLSearchParams, 'get'>): GroupFilter[] {
  const out: GroupFilter[] = [];
  for (const kind of KINDS) {
    const v = params.get(GROUP_PARAM[kind]);
    if (v) out.push({ kind, key: decodeKey(v) });
  }
  return out;
}

/** The address with one group filter removed (other parameters kept). */
export function withoutGroup(params: URLSearchParams, kind: GroupKind): string {
  const q = new URLSearchParams(params);
  q.delete(GROUP_PARAM[kind]);
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

/** The address with every group filter removed. */
export function withoutGroups(params: URLSearchParams): string {
  const q = new URLSearchParams(params);
  for (const k of KINDS) q.delete(GROUP_PARAM[k]);
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

/**
 * The bets of one group, by the grouping the Analytics row used (a rollover shot whole; dutches are made whole by
 * the caller, as Bets filters do), and the row's label for the chip ("" when nothing matches).
 */
export function matchGroup(bets: Bet[], g: GroupFilter): { bets: Bet[]; label: string } {
  if (g.kind === 'bet') {
    const hit = bets.filter((b) => b.id === g.key);
    return { bets: hit, label: hit[0] ? hit[0].betText || hit[0].legs.map((l) => l.selection).filter(Boolean).join(' + ') || 'one bet' : '' };
  }
  if (g.kind === 'dutchSplits' || g.kind === 'dutchOdds') {
    const keys = dutchGroupKeys(bets);
    const pick = (b: Bet) => (b.dutchId ? keys.get(b.dutchId)?.[g.kind === 'dutchSplits' ? 'splits' : 'odds'] : undefined);
    const hit = bets.filter((b) => pick(b)?.key === g.key);
    return { bets: hit, label: hit[0] ? pick(hit[0])!.label : '' };
  }
  const d = g.kind;
  const fn = groupKeyFn(bets, d);
  // text keys are case- and accent-insensitive (as the breakdown groups them), so a typed "?sport=Basketball" works
  const key = TEXT_KINDS.has(d) && !g.key.startsWith('\u0000') ? normalize(g.key) : g.key;
  const rows = collapseRollovers(bets).filter((c) => inGroup(fn, d, key, c));
  const ids = new Set(rows.filter((c) => !c.rolloverId).map((c) => c.id));
  const chains = new Set(rows.flatMap((c) => (c.rolloverId ? [c.rolloverId] : [])));
  // odds: a band's label ("Shot 1.80+"), or a Shot sub-row's with its band ("Shot 2.00–2.99")
  const label = !rows[0] ? '' : d !== 'odds' ? fn(rows[0]).label : g.key.includes(':') ? `${g.key.split(':')[0]} ${fn(rows[0]).label}` : (ODDS_BANDS.find((x) => x.key === g.key)?.label ?? g.key);
  return { bets: bets.filter((b) => ids.has(b.id) || (!!b.rolloverId && chains.has(b.rolloverId))), label };
}

/** Every group filter applied in turn, each group's dutches whole (as Bets filters keep them). */
export function applyGroups(bets: Bet[], groups: GroupFilter[]): Bet[] {
  return groups.reduce((acc, g) => withWholeGroups(acc, matchGroup(acc, g).bets), bets);
}

export const isDimension = (k: GroupKind): k is Dimension => (DIMENSIONS as readonly string[]).includes(k);
