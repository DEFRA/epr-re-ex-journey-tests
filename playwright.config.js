import { defineConfig } from '@playwright/test'

const environment = process.env.ENVIRONMENT
const isCI = !!process.env.CI
const isLocalDev = !isCI && !environment
const debug = !!process.env.DEBUG

const frontendHost = environment
  ? `epr-frontend.${environment}.cdp-int.defra.cloud`
  : 'localhost'

// Answer the cookie banner before any journey starts, so 36 specs do not each
// have to know it exists. Rejecting rather than accepting: a suite run is not a
// user, and its traffic would land in the same analytics property the service
// is measured on. The banner and the accept path are covered by their own spec.
const analyticsRejected = {
  cookies: [
    {
      name: 'analyticsConsent',
      value: 'rejected',
      domain: frontendHost,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: !!environment,
      sameSite: /** @type {const} */ ('Lax')
    }
  ],
  origins: []
}

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
      ? `https://${frontendHost}`
      : `http://${frontendHost}:${process.env.FRONTEND_PORT || 3000}`,
    storageState: analyticsRejected,
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
  // as a frozen terminal rather than a failure. 1 minute covers
  // the slowest legitimate single-step wait in the suite (30s, summary log
  // processing) plus the rest of a test's steps, and is already proven safe
  // since CI runs green with it.
  timeout: debug ? 2 * 60 * 1000 : 2 * 60 * 1000
})
