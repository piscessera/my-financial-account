import { defineConfig } from 'vitest/config';

// Main-process / calculation-engine unit tests only (CLAUDE.md §Project: Vitest).
// The renderer is covered separately if/when UI tests are added.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
  },
});
