// BT-42: game page links.
import { describe, expect, it } from 'vitest';
import { addLink, linksFor, linksForBets, siteMark, siteOf, type GameLink } from '@/lib/gameLinks';
import { bet, leg } from './helpers';

describe('siteOf', () => {
  it('recognizes Sofascore and Hoops Junkie by domain', () => {
    expect(siteOf('https://www.sofascore.com/basketball/match/celtics-lakers/abc#id:123')).toMatchObject({ site: 'sofascore', name: 'Sofascore' });
    expect(siteOf('https://m.sofascore.com/x')).toMatchObject({ site: 'sofascore' });
    expect(siteOf('https://hoopsjunkie.net/games/2026-11-24/bos-lal')).toMatchObject({ site: 'hoopsjunkie', name: 'Hoops Junkie' });
    expect(siteOf('  https://www.hoopsjunkie.com/g/1  ')).toMatchObject({ site: 'hoopsjunkie' });
  });
  it('any other site is kept and named by its domain', () => {
    expect(siteOf('https://www.espn.com/nba/game/_/gameId/1')).toMatchObject({ site: 'espn.com', name: 'espn.com' });
    expect(siteMark('espn.com')).toBe('ES');
    expect(siteMark('sofascore')).toBe('SS');
    expect(siteMark('hoopsjunkie')).toBe('HJ');
  });
  it('refuses anything that is not an http(s) URL', () => {
    for (const t of ['', 'sofascore.com/x', 'celtics lakers', 'javascript:alert(1)', 'ftp://sofascore.com/x', 'http://localhost/x']) expect(siteOf(t)).toBeNull();
  });
});

describe('same-game matching', () => {
  const links: GameLink[] = [
    { game: 'celtics @ lakers', date: '2026-11-24', site: 'sofascore', url: 'https://www.sofascore.com/a' },
    { game: 'celtics @ lakers', date: '2026-11-23', site: 'sofascore', url: 'https://www.sofascore.com/old' },
  ];
  it('matches the game text normalized as the autocomplete does, and the same game date only', () => {
    expect(linksFor(links, '  Celtics @ Lakers ', '2026-11-24').map((l) => l.url)).toEqual(['https://www.sofascore.com/a']);
    expect(linksFor(links, 'CELTICS @ LAKERS', '2026-11-25')).toEqual([]);
    expect(linksFor(links, '', '2026-11-24')).toEqual([]);
  });
  it('every bet on that game shows it, each link once for a dutch', () => {
    const b1 = bet({ gameDate: '2026-11-24', legs: [leg({ game: 'Celtics @ Lakers' })] });
    const b2 = bet({ gameDate: '2026-11-24', legs: [leg({ game: 'celtics @ lakers' })] });
    expect(linksForBets(links, [b1, b2])).toHaveLength(1);
  });
  it('adding: a site replaces its own link; a third site is refused; a bad address is refused', () => {
    const r = addLink(links, 'Celtics @ Lakers', '2026-11-24', 'https://www.sofascore.com/b');
    expect(r.ok && linksFor(r.links, 'celtics @ lakers', '2026-11-24').map((l) => l.url)).toEqual(['https://www.sofascore.com/b']);
    const two = addLink(links, 'Celtics @ Lakers', '2026-11-24', 'https://hoopsjunkie.net/g');
    expect(two.ok).toBe(true);
    const three = addLink(two.ok ? two.links : [], 'Celtics @ Lakers', '2026-11-24', 'https://espn.com/g');
    expect(three).toEqual({ ok: false, error: 'Up to 2 links per game: remove one first' });
    expect(addLink(links, 'Celtics @ Lakers', '2026-11-24', 'not a link')).toMatchObject({ ok: false });
  });
});
