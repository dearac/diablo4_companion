import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Vitest configuration for unit tests.
 *
 * This config tells Vitest where to find tests and how to run them.
 * Unit tests live in the test/unit/ folder and test individual
 * classes and functions in isolation (no Electron, no browser).
 */
export default defineConfig({
  test: {
    /* Look for test files in the test/unit directory */
    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],

    /* Use jsdom for any React component tests that need a fake DOM */
    environment: 'jsdom',

    /* Make sure TypeScript paths resolve correctly */
    alias: {
      '@': resolve(__dirname, 'src'),
      'electron': resolve(__dirname, '__mocks__/electron.js'),
      '@electron-toolkit/utils': resolve(__dirname, '__mocks__/@electron-toolkit/utils.js')
    }
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
