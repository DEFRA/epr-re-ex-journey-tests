import { globSync } from 'node:fs'

import { playwrightArgs } from '../test/support/playwright-args.js'

const files = globSync('**/*.e2e.js', { cwd: 'test/specs' })

process.stdout.write(
  playwrightArgs(files, {
    scope: process.env.PW_SCOPE,
    suite: process.env.PW_SUITE,
    december: process.env.PW_DECEMBER,
    shard: process.env.PW_SHARD
  }).join(' ')
)
