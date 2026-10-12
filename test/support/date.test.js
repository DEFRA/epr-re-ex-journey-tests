import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from './simulator/clock/under-clock.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} instant
 * @param {string} module
 * @param {string} name
 */
const exportedAt = (instant, module, name) =>
  evaluateUnderClock(
    instant,
    `const m = await import('${join(here, module)}')
     const value = m['${name}']
     console.log(typeof value === 'function' ? value() : value)`
  )

const instants = [
  { instant: '2026-06-15T12:00:00Z', year: '2026' },
  { instant: '2027-12-31T23:59:00Z', year: '2027' },
  { instant: '2028-01-01T00:00:30Z', year: '2028' }
]

describe('the current year', () => {
  for (const { instant, year } of instants) {
    it(`should be ${year} at ${instant}`, () => {
      assert.equal(exportedAt(instant, 'date.js', 'currentYear'), year)
    })

    it(`should start seeded organisations on 1 january ${year} at ${instant}`, () => {
      assert.equal(
        exportedAt(instant, 'seeding/organisation.js', 'SEEDED_VALID_FROM'),
        `${year}-01-01`
      )
    })

    it(`should apply seeded organisations on 31 december ${Number(year) - 1} at ${instant}`, () => {
      assert.equal(
        exportedAt(instant, 'seeding/organisation.js', 'SEEDED_CREATED_ON'),
        `${Number(year) - 1}-12-31`
      )
    })
  }
})
