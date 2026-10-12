import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from './simulator/clock/under-clock.js'

const module = join(
  dirname(fileURLToPath(import.meta.url)),
  'docker.log.parser.js'
)

describe('the docker log parser', () => {
  it('should ask docker for logs since real time when the stack is on a simulated clock', () => {
    const since = evaluateUnderClock(
      '2028-06-15T10:00:00Z',
      `const { DockerLogParser } = await import('${module}')
       const parser = new DockerLogParser('epr-backend')
       let since
       parser.runDockerCommand = async (timestamp) => { since = timestamp; return '' }
       await parser.getLogs()
       console.log(since)`
    )

    const drift = Math.abs(Date.parse(`${since}Z`) - Date.now())
    assert.ok(drift < 60_000, `asked for logs since ${since}`)
  })
})
