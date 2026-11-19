import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from '../simulator/clock/under-clock.js'

const module = join(dirname(fileURLToPath(import.meta.url)), 'recent-date.js')

/**
 * The earliest and latest of many draws for a log of `year`, as ISO dates.
 *
 * @param {string} instant
 * @param {number} year
 * @param {number} days
 * @returns {{ earliest: string, latest: string }}
 */
const drawsAt = (instant, year, days) =>
  JSON.parse(
    evaluateUnderClock(
      instant,
      `const { recentDateIn } = await import('${module}')
       const draws = Array.from({ length: 500 }, () => recentDateIn(${year}, ${days}).getTime())
       console.log(JSON.stringify({
         earliest: new Date(Math.min(...draws)).toISOString(),
         latest: new Date(Math.max(...draws)).toISOString()
       }))`
    )
  )

/**
 * @param {string} instant
 * @param {number} year
 * @returns {string} the first of the month, as a UK date
 */
const firstOfLastMonthAt = (instant, year) =>
  evaluateUnderClock(
    instant,
    `const { firstOfLastMonthIn } = await import('${module}')
     console.log(firstOfLastMonthIn(${year}).toLocaleDateString('en-GB'))`
  )

describe('a recent load date', () => {
  it('stays in this year in early January', () => {
    const { earliest, latest } = drawsAt('2027-01-05T12:00:00Z', 2027, 20)

    assert.ok(earliest >= '2027-01-01', `earliest draw ${earliest}`)
    assert.ok(latest <= '2027-01-05T12:00:00.000Z', `latest draw ${latest}`)
  })

  it('reaches back the given number of days later in the year', () => {
    const { earliest, latest } = drawsAt('2026-06-15T12:00:00Z', 2026, 20)

    assert.ok(
      earliest >= '2026-05-26T12:00:00.000Z',
      `earliest draw ${earliest}`
    )
    assert.ok(earliest < '2026-06-01', `earliest draw ${earliest}`)
    assert.ok(latest <= '2026-06-15T12:00:00.000Z', `latest draw ${latest}`)
  })

  it("falls on the same days of last year for last year's log", () => {
    const { earliest, latest } = drawsAt('2027-03-15T12:00:00Z', 2026, 20)

    assert.ok(
      earliest >= '2026-02-23T12:00:00.000Z',
      `earliest draw ${earliest}`
    )
    assert.ok(latest <= '2026-03-15T12:00:00.000Z', `latest draw ${latest}`)
  })

  it("stays in last year for last year's log in early January", () => {
    const { earliest, latest } = drawsAt('2027-01-05T12:00:00Z', 2026, 20)

    assert.ok(earliest >= '2026-01-01', `earliest draw ${earliest}`)
    assert.ok(latest <= '2026-01-05T12:00:00.000Z', `latest draw ${latest}`)
  })

  it("keeps this year's dates for next year's log", () => {
    const { earliest, latest } = drawsAt('2026-06-15T12:00:00Z', 2027, 20)

    assert.ok(
      earliest >= '2026-05-26T12:00:00.000Z',
      `earliest draw ${earliest}`
    )
    assert.ok(latest <= '2026-06-15T12:00:00.000Z', `latest draw ${latest}`)
  })
})

describe('the first of last month', () => {
  for (const { instant, year, expected } of [
    { instant: '2026-06-15T12:00:00Z', year: 2026, expected: '01/05/2026' },
    { instant: '2027-01-15T12:00:00Z', year: 2027, expected: '01/12/2026' },
    { instant: '2027-10-15T12:00:00Z', year: 2026, expected: '01/12/2026' }
  ]) {
    it(`is ${expected} for a ${year} log at ${instant}`, () => {
      assert.equal(firstOfLastMonthAt(instant, year), expected)
    })
  }
})
