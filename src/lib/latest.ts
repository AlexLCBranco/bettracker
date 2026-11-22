/**
 * Tracks the newest request per key, so a slow earlier response can't overwrite a newer one's result.
 * Usage: const t = gate.begin(id); const res = await …; if (gate.isLatest(id, t)) apply(res);
 */
export function latestGate() {
  const latest = new Map<string, number>();
  let next = 0;
  return {
    begin(key: string): number {
      const token = ++next;
      latest.set(key, token);
      return token;
    },
    isLatest(key: string, token: number): boolean {
      return latest.get(key) === token;
    },
  };
}
