import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@online-rummy/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/rng.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
});
