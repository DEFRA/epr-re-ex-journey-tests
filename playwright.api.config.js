import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/api-specs',
  testMatch: '**/*.api.e2e.js',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 2,

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
