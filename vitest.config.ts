import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts', 'web/**/*.test.{ts,tsx}', '.github/workflows/*.test.ts'],
  },
})
