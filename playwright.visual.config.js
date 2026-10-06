import { defineConfig } from '@playwright/test'

import base from './playwright.config.js'

// Visual and ARIA snapshot specs, run on their own in the Playwright image the
// Dockerfile pins - never on a laptop or a bare runner, where fonts and
// anti-aliasing differ. Allure needs Java, which that image lacks, so this run
// reports to the console and keeps its raw output (expected, actual and diff
// images) in its own directory for CI to upload.
//
// The shared config blocks web fonts, which suits the other specs. Pixel
// baselines have to show the typeface a visitor sees, so this run loads them.
const { launchOptions } = base.use

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/*.visual.e2e.js',
  globalTeardown: undefined,
  reporter: [['list']],
  outputDir: 'test-results-visual',
  maxFailures: 0,
  retries: 0,
  workers: 1,
  use: {
    ...base.use,
    launchOptions: {
      ...launchOptions,
      args: launchOptions.args.filter((arg) => arg !== '--disable-remote-fonts')
    }
  }
})
