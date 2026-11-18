import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateUnderClock } from '../simulator/clock/under-clock.js'

const module = join(dirname(fileURLToPath(import.meta.url)), 'recent-date.js')

/**
 * The earliest and latest of many draws, as ISO dates.
 *
 * @param {string} instant
 * @param {number} days
 * @returns {{ earliest: string, latest: string }}
 */
const drawsAt = (instant, days) =>
  JSON.parse(
    evaluateUnderClock(
      instant,
      `const { recentDateThisYear } = await import('${module}')
       const draws = Array.from({ length: 500 }, () => recentDateThisYear(${days}).getTime())
       console.log(JSON.stringify({
         earliest: new Date(Math.min(...draws)).toISOString(),
         latest: new Date(Math.max(...draws)).toISOString()
       }))`
    )
  )

describe('a recent load date', () => {
  it('stays in this year in early January', () => {
    const { earliest, latest } = drawsAt('2027-01-05T12:00:00Z', 20)

    assert.ok(earliest >= '2027-01-01', `earliest draw ${earliest}`)
    assert.ok(latest <= '2027-01-05T12:00:00.000Z', `latest draw ${latest}`)
  })

  it('reaches back the given number of days later in the year', () => {
    const { earliest, latest } = drawsAt('2026-06-15T12:00:00Z', 20)

    assert.ok(
      earliest >= '2026-05-26T12:00:00.000Z',
      `earliest draw ${earliest}`
    )
    assert.ok(earliest < '2026-06-01', `earliest draw ${earliest}`)
    assert.ok(latest <= '2026-06-15T12:00:00.000Z', `latest draw ${latest}`)
  })
})
