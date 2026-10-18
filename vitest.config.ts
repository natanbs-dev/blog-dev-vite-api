import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // todos os arquivos usam o mesmo banco: rodam um de cada vez
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
