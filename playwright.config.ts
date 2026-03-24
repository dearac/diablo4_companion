import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'on'
  },
  reporter: [['list'], ['html', { open: 'never' }]]
})
