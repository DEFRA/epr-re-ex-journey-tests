import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from '../simulator/clock/under-clock.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} instant
 * @param {string} module
 * @param {string} name
 */
const receivedDateAt = (instant, module, name) =>
  evaluateUnderClock(
    instant,
    `const m = await import('${join(here, module)}')
     console.log(m['${name}']().G)`
  )

const generators = [
  { module: 'exporter.reg.only.js', name: 'generateRegOnlyReceivedRow' },
  {
    module: 'reprocessor.reg.only.js',
    name: 'generateRegOnlyReprocessorReceivedRow'
  }
]

const instants = [
  { instant: '2026-06-15T12:00:00Z', received: '01/05/2026' },
  { instant: '2027-01-15T12:00:00Z', received: '01/12/2026' }
]

describe('a registered-only received row', () => {
  for (const { module, name } of generators) {
    for (const { instant, received } of instants) {
      it(`${name} is dated the first of last month, ${received}, at ${instant}`, () => {
        assert.equal(receivedDateAt(instant, module, name), received)
      })
    }
  }
})
