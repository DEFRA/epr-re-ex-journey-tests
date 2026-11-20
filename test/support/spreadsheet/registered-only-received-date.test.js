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
 * @param {number} year - the summary log's year
 */
const receivedDateAt = (instant, module, name, year) =>
  evaluateUnderClock(
    instant,
    `const m = await import('${join(here, module)}')
     console.log(m['${name}'](undefined, ${year}).G)`
  )

const generators = [
  { module: 'exporter.reg.only.js', name: 'generateRegOnlyReceivedRow' },
  {
    module: 'reprocessor.reg.only.js',
    name: 'generateRegOnlyReprocessorReceivedRow'
  }
]

const instants = [
  { instant: '2026-06-15T12:00:00Z', year: 2026, received: '01/05/2026' },
  // Last month is in an earlier year than the log.
  { instant: '2027-01-15T12:00:00Z', year: 2027, received: '01/01/2027' },
  // Last month is in a later year than the log, which the service rejects.
  { instant: '2027-10-15T12:00:00Z', year: 2026, received: '01/12/2026' }
]

describe('a registered-only received row', () => {
  for (const { module, name } of generators) {
    for (const { instant, year, received } of instants) {
      it(`${name} for a ${year} log is dated ${received} at ${instant}`, () => {
        assert.equal(receivedDateAt(instant, module, name, year), received)
      })
    }
  }
})
