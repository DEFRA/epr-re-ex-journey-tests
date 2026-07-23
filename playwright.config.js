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

if (!environment) {
  // epr-frontend redirects the browser to the real Defra ID stub hostname
  // during sign-in; compose only publishes it on localhost, so map the
  // internal name there for local/GHA runs against the docker-compose stack.
  chromeArgs.push('--host-resolver-rules=MAP defra-id-stub:3200 localhost:3200')
}

export default defineConfig({
  testDir: './test/specs',
  testMatch: '**/*.e2e.js',

  fullyParallel: false,
  forbidOnly: isCI,
  maxFailures: isLocalDev ? 1 : 0,
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : 1,

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
      : 'http://localhost:3000',
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

  timeout: debug ? 60 * 60 * 1000 : isCI ? 2 * 60 * 1000 : 5 * 60 * 1000
})
