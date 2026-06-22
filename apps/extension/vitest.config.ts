import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests only — no DOM, no chrome.* APIs. Anything that
    // touches the DOM goes through the WXT/Vite build; we test the
    // testable seams (parsers, heuristics, math) here.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'entrypoints/**', '.output/**', '.wxt/**'],
  },
})
