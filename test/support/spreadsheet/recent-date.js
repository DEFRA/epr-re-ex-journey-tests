import { fakerEN_GB as faker } from '@faker-js/faker'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The year a log's dates are drawn in. A log for a later year than this one
 * keeps this year's dates, as it always has.
 *
 * @param {number} year - the summary log's year
 * @returns {number}
 */
const dateYearFor = (year) => Math.min(year, new Date().getUTCFullYear())

/**
 * A random date within the `days` days up to today, moved into the summary
 * log's year and not before 1 January of it. The service rejects a log
 * holding a date in a later year than its own, and an accredited load dated
 * before its accreditation's year counts for nothing. A log for an earlier
 * year takes today's day of that year rather than its 31 December, so its
 * loads don't all land in the December waste pool.
 *
 * @param {number} year - the summary log's year
 * @param {number} days
 * @returns {Date}
 */
export function recentDateIn(year, days) {
  const anchor = new Date()
  anchor.setUTCFullYear(dateYearFor(year))
  const startOfYear = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1))
  const daysAgo = new Date(anchor.getTime() - days * DAY_MS)

  return faker.date.between({
    from: daysAgo > startOfYear ? daysAgo : startOfYear,
    to: anchor
  })
}

/**
 * The first of last month, but no later than December of the summary log's
 * year, which the service rejects a log for going past. In January it is
 * last December.
 *
 * @param {number} year - the summary log's year
 * @returns {Date}
 */
export function firstOfLastMonthIn(year) {
  const now = new Date()
  // Month 0 less one is December of the year before.
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return firstOfLastMonth.getFullYear() > year
    ? new Date(year, 11, 1)
    : firstOfLastMonth
}
