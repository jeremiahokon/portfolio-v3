import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Tests cover the pure pipeline modules only — `src/lib/subtitles/*` and
 * `src/lib/media/*` helpers that take plain data in and give plain data out.
 * Anything that needs a worker, a model session or the DOM is verified in a real
 * browser instead, because a jsdom stand-in for WebGPU or the Cache API proves
 * nothing about whether the tool works.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
