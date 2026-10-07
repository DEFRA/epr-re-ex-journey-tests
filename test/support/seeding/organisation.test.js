import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from '../simulator/clock/under-clock.js'

const module = join(dirname(fileURLToPath(import.meta.url)), 'organisation.js')

/**
 * @param {string} instant
 * @param {'monthly' | 'quarterly'} cadence
 */
const validFromAt = (instant, cadence) =>
  evaluateUnderClock(
    instant,
    `const { validFromWithClosedPeriod } = await import('${module}')
     console.log(validFromWithClosedPeriod('${cadence}'))`
  )

describe('a valid-from date with a closed reporting period', () => {
  for (const { instant, cadence, expected } of /** @type {const} */ ([
    {
      instant: '2027-01-15T10:00:00Z',
      cadence: 'monthly',
      expected: '2026-01-01'
    },
    {
      instant: '2027-02-15T10:00:00Z',
      cadence: 'monthly',
      expected: '2027-01-01'
    },
    {
      instant: '2027-01-15T10:00:00Z',
      cadence: 'quarterly',
      expected: '2026-01-01'
    },
    {
      instant: '2027-03-31T10:00:00Z',
      cadence: 'quarterly',
      expected: '2026-01-01'
    },
    {
      instant: '2027-04-15T10:00:00Z',
      cadence: 'quarterly',
      expected: '2027-01-01'
    }
  ])) {
    it(`should be ${expected} for ${cadence} reporting at ${instant}`, () => {
      assert.equal(validFromAt(instant, cadence), expected)
    })
  }
})
