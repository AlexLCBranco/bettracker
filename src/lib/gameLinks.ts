// BT-42: links to a game's page on Hoops Junkie or Sofascore, pasted once per game. A link belongs to the GAME (its
// text normalized as the autocomplete does, plus its game date), so every bet on that game shows it. Up to two links
// per game, one per site. Addresses are never guessed from team names: the app has no fixture data (I-2).

import { normalize } from './autocomplete';
import type { Bet } from './types';

export interface GameLink {
  /** The game's normalized text (`gameKey`). */
  game: string;
  /** Local "YYYY-MM-DD" game date. */
  date: string;
  /** "sofascore", "hoopsjunkie", or the domain for any other site. */
  site: string;
  url: string;
}

export const MAX_LINKS_PER_GAME = 2;

export const gameKey = (game: string) => normalize(game.trim());

/** The site of a pasted address, or null when it is not a valid http(s) URL. */
export function siteOf(text: string): { site: string; name: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.')) return null;
  if (host === 'sofascore.com' || host.endsWith('.sofascore.com')) return { site: 'sofascore', name: 'Sofascore', url: u.href };
  if (/(^|\.)hoopsjunkie\./.test(host) || host.startsWith('hoopsjunkie')) return { site: 'hoopsjunkie', name: 'Hoops Junkie', url: u.href };
  return { site: host, name: host, url: u.href };
}

/** What a mark says: "SS", "HJ", or the domain's first letters. */
export function siteMark(site: string): string {
  if (site === 'sofascore') return 'SS';
  if (site === 'hoopsjunkie') return 'HJ';
  return site.split('.')[0]!.slice(0, 2).toUpperCase();
}

export function siteName(site: string): string {
  return site === 'sofascore' ? 'Sofascore' : site === 'hoopsjunkie' ? 'Hoops Junkie' : site;
}

/** The links of one game on one date, Hoops Junkie first, then Sofascore, then others. */
export function linksFor(links: GameLink[], game: string, date: string): GameLink[] {
  const k = gameKey(game);
  if (!k) return [];
  const order = (s: string) => (s === 'hoopsjunkie' ? 0 : s === 'sofascore' ? 1 : 2);
  return links.filter((l) => l.game === k && l.date === date).sort((a, b) => order(a.site) - order(b.site) || a.site.localeCompare(b.site));
}

/** Every game's links for a row's bets (each bet's games on its game date), each link once. */
export function linksForBets(links: GameLink[], bets: Pick<Bet, 'legs' | 'gameDate'>[]): GameLink[] {
  const seen = new Set<string>();
  const out: GameLink[] = [];
  for (const b of bets)
    for (const l of b.legs)
      for (const link of linksFor(links, l.game, b.gameDate)) {
        const id = `${link.game}|${link.date}|${link.site}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(link);
      }
  return out;
}

/**
 * The links after saving `text` for a game: a site's link replaces that site's old one; a third site is refused.
 * Returns the error text instead when the address is not valid or the game already has two other sites.
 */
export function addLink(links: GameLink[], game: string, date: string, text: string): { ok: true; link: GameLink; links: GameLink[] } | { ok: false; error: string } {
  const s = siteOf(text);
  if (!s) return { ok: false, error: 'Not a web address: paste a link starting with https://' };
  const k = gameKey(game);
  if (!k) return { ok: false, error: 'Add the game first' };
  const link: GameLink = { game: k, date, site: s.site, url: s.url };
  const mine = linksFor(links, game, date).filter((l) => l.site !== s.site);
  if (mine.length >= MAX_LINKS_PER_GAME) return { ok: false, error: `Up to ${MAX_LINKS_PER_GAME} links per game: remove one first` };
  return { ok: true, link, links: [...links.filter((l) => !(l.game === k && l.date === date && l.site === s.site)), link] };
}
