// BT-32: what the PP research says. Per batch and across batches: how each tier and each leg did, against what the
// odds implied (1 / odds), and which leg killed PPs that were otherwise complete. No settled legs → null ("-").

import { normalize } from './autocomplete';
import { ticketLegs, type PPBatch, type PPLeg } from './pp';

export interface HitRow {
  key: string;
  label: string;
  won: number;
  lost: number;
  void: number;
  pending: number;
  /** won / (won + lost); null with none settled. */
  hitRate: number | null;
  /** The average chance the odds implied (1 / odds) over the same won and lost legs; null with none settled. */
  implied: number | null;
}

function row(key: string, label: string, legs: PPLeg[]): HitRow {
  const won = legs.filter((l) => l.result === 'won');
  const lost = legs.filter((l) => l.result === 'lost');
  const settled = [...won, ...lost];
  return {
    key,
    label,
    won: won.length,
    lost: lost.length,
    void: legs.filter((l) => l.result === 'void').length,
    pending: legs.filter((l) => l.result === 'pending').length,
    hitRate: settled.length ? won.length / settled.length : null,
    implied: settled.length ? settled.reduce((a, l) => a + 1 / l.odds, 0) / settled.length : null,
  };
}

/** Per tier, in tier order. Across batches a tier is matched by its name (case and accents ignored). */
export function tierStats(batches: PPBatch[]): HitRow[] {
  const groups = new Map<string, { label: string; legs: PPLeg[] }>();
  for (const b of batches) {
    const name = new Map(b.tiers.map((t) => [t.id, t.name]));
    for (const t of b.tiers) if (!groups.has(normalize(t.name))) groups.set(normalize(t.name), { label: t.name, legs: [] });
    for (const l of b.legs) {
      const n = name.get(l.tier) ?? 'No tier';
      if (!groups.has(normalize(n))) groups.set(normalize(n), { label: n, legs: [] });
      groups.get(normalize(n))!.legs.push(l);
    }
  }
  return [...groups.entries()].map(([k, g]) => row(k, g.label, g.legs));
}

/** Leg hit rate by sport or by market, most legs first ("Not set" for empty). */
export function legBreakdown(batches: PPBatch[], by: 'sport' | 'market'): HitRow[] {
  const groups = new Map<string, { label: string; legs: PPLeg[] }>();
  for (const l of batches.flatMap((b) => b.legs)) {
    const v = l[by].trim();
    const k = v ? normalize(v) : '\u0000';
    if (!groups.has(k)) groups.set(k, { label: v || 'Not set', legs: [] });
    groups.get(k)!.legs.push(l);
  }
  return [...groups.entries()].map(([k, g]) => row(k, g.label, g.legs)).sort((a, b) => b.won + b.lost - (a.won + a.lost) || a.label.localeCompare(b.label));
}

export interface LostByOne {
  leg: PPLeg;
  /** PPs where this was the only lost leg and every other leg won (or was void). */
  count: number;
  numbers: number[];
}

/** "Jokic 12+ ast killed 9 PPs that were otherwise complete", most first. */
export function lostByOne(batch: PPBatch): LostByOne[] {
  const m = new Map<string, LostByOne>();
  for (const t of batch.tickets) {
    const legs = ticketLegs(t, batch.legs);
    const lost = legs.filter((l) => l.result === 'lost');
    if (lost.length !== 1 || legs.some((l) => l.result === 'pending') || !legs.some((l) => l.result === 'won')) continue;
    const l = lost[0]!;
    if (!m.has(l.id)) m.set(l.id, { leg: l, count: 0, numbers: [] });
    const e = m.get(l.id)!;
    e.count++;
    e.numbers.push(t.number);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.leg.selection.localeCompare(b.leg.selection));
}

export interface TierPoint {
  batchId: string;
  name: string;
  date: string;
  /** Hit rate per tier name (as shown); null when that tier had no settled legs in the batch. */
  rates: Record<string, number | null>;
}

/** Hit rate per tier over time: one point per batch, oldest first. */
export function tierHitOverTime(batches: PPBatch[]): { tiers: string[]; points: TierPoint[] } {
  const tiers = tierStats(batches).map((r) => r.label);
  const byKey = new Map(tiers.map((t) => [normalize(t), t]));
  const points = [...batches]
    .sort((a, b) => (a.placedDate === b.placedDate ? (a.createdAt < b.createdAt ? -1 : 1) : a.placedDate < b.placedDate ? -1 : 1))
    .map((b) => {
      const rates: Record<string, number | null> = Object.fromEntries(tiers.map((t) => [t, null]));
      for (const r of tierStats([b])) rates[byKey.get(r.key) ?? r.label] = r.hitRate;
      return { batchId: b.id, name: b.name, date: b.placedDate, rates };
    });
  return { tiers, points };
}

/** Batches placed in a date range ("" = open end). */
export const batchesBetween = (batches: PPBatch[], from: string, to: string) => batches.filter((b) => (!from || b.placedDate >= from) && (!to || b.placedDate <= to));
