import { defineConfig } from '@playwright/test'

const environment = process.env.ENVIRONMENT
const isCI = !!process.env.CI
const isLocalDev = !isCI && !environment
const debug = !!process.env.DEBUG

const chromeArgs = [
  '--no-sandbox',
  '--disable-infobars',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--enable-features=NetworkService,NetworkServiceInProcess',
  '--password-store=basic',
  '--use-mock-keychain',
  '--dns-prefetch-disable',
  '--disable-background-networking',
  '--disable-remote-fonts',
  '--ignore-certificate-errors',
  '--disable-dev-shm-usage'
]

export default defineConfig({
  testDir: './test/specs',
  testMatch: '**/*.e2e.js',

  fullyParallel: false,
  forbidOnly: isCI,
  maxFailures: isLocalDev ? 1 : 0,
  retries: 1,
  workers: isCI ? 5 : 1,

  globalSetup: './test/support/global-setup.js',
  globalTeardown: './test/support/global-teardown.js',

  reporter: [
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results'
      }
    ]
  ],

  use: {
    baseURL: environment
      ? `https://epr-frontend.${environment}.cdp-int.defra.cloud`
      : `http://localhost:${process.env.FRONTEND_PORT || 3000}`,
    headless: !debug,
    screenshot: isLocalDev ? 'on' : 'only-on-failure',
    trace: isLocalDev ? 'on' : 'retain-on-failure',
    video: isLocalDev ? 'on' : 'off',
    launchOptions: {
      args: chromeArgs,
      proxy: process.env.HTTP_PROXY
        ? { server: process.env.HTTP_PROXY }
        : undefined
    }
  },

  // Same ceiling as CI: 5 minutes locally meant a genuinely hung test (a
  // locator that will never resolve) took 5 minutes to surface, which reads
  // as a frozen terminal rather than a failure. 2 minutes comfortably covers
  // the slowest legitimate single-step wait in the suite (60s, summary log
  // processing) plus the rest of a test's steps, and is already proven safe
  // since CI runs green with it.
  timeout: debug ? 60 * 60 * 1000 : 2 * 60 * 1000
})
