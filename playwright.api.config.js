import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/api-specs',
  testMatch: '**/*.api.e2e.js',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  reporter: [
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results'
      }
    ]
  ],

  timeout: 60000
})
