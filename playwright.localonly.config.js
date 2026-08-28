import { defineConfig } from '@playwright/test'

// Specialised runner for test/localonly - deliberately not wired into the
// default `npm test` / `test:local` / `test:github` scripts (those only run
// playwright.api.config.js and playwright.config.js). Invoke explicitly via
// `npm run test:localonly` against a local docker compose stack.
export default defineConfig({
  testDir: './test/localonly',
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

  timeout: 20 * 60 * 1000
})
