import { spawnSync } from 'node:child_process'
import { globSync, writeFileSync } from 'node:fs'

import { playwrightArgs } from '../test/support/playwright-args.js'

const runBrowserSpecs = () => {
  const files = globSync('**/*.e2e.js', { cwd: 'test/specs' })
  const selection = playwrightArgs(files, {
    scope: process.env.PW_SCOPE,
    suite: process.env.PW_SUITE,
    december: process.env.PW_DECEMBER,
    shard: process.env.PW_SHARD
  })
  const { status } = spawnSync(
    'node_modules/.bin/playwright',
    [
      'test',
      '--config=playwright.config.js',
      ...selection,
      ...process.argv.slice(2)
    ],
    { stdio: 'inherit' }
  )
  return status === 0
}

const passed = (() => {
  try {
    return runBrowserSpecs()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return false
  }
})()

if (!passed) {
  writeFileSync('FAILED', '')
}
