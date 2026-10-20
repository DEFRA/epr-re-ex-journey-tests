import { globSync } from 'node:fs'

import { shardFilePatterns } from '../test/support/shard.js'

const files = globSync('**/*.e2e.js', { cwd: 'test/specs' })

process.stdout.write(
  shardFilePatterns(files, process.env.PW_SHARD ?? '').join(' ')
)
