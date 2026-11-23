import { readFileSync } from 'node:fs'

import { playwrightImageMismatch } from '../test/support/playwright-image.js'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'))

const failure = playwrightImageMismatch(
  dockerfile,
  dependencies['@playwright/test']
)

if (failure) {
  process.stderr.write(`${failure}\n`)
  process.exitCode = 1
}
