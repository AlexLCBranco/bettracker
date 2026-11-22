import { describe, expect, it } from 'vitest';
import { changesNeedBump, isBumped } from '../scripts/check-version';

describe('check-version', () => {
  it('app files need a bump; tests, docs and CI do not', () => {
    expect(changesNeedBump(['src/lib/money.ts'])).toBe(true);
    expect(changesNeedBump(['package.json'])).toBe(true);
    expect(changesNeedBump(['tests/money.test.ts', 'BUILT.md', '.github/workflows/ci.yml', 'e2e/app.spec.ts'])).toBe(false);
  });
  it('compares versions', () => {
    expect(isBumped('0.1.0', '0.1.1')).toBe(true);
    expect(isBumped('0.1.9', '0.2.0')).toBe(true);
    expect(isBumped('0.2.0', '0.2.0')).toBe(false);
    expect(isBumped('1.0.0', '0.9.9')).toBe(false);
  });
});
