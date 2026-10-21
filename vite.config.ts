import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '0.0.0.0', port: 8741, strictPort: true },
  preview: { host: '0.0.0.0', port: 8741, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.ts'],
    testTimeout: 30000,
  },
});
