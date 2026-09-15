import { describe, expect, it } from 'vitest';

// Trivial smoke test confirming the Vitest runner is wired up for main-process
// code (AT-1.2). Real main-process/calculation-engine tests replace this later.
describe('vitest setup', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
