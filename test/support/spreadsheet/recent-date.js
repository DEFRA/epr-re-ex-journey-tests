import { fakerEN_GB as faker } from '@faker-js/faker'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A random date within the `days` days up to today, moved into the summary
 * log's year and not before 1 January of it. The service rejects a log
 * holding a date in a later year than its own, an accredited load dated
 * before its accreditation's year counts for nothing, and an earlier year's
 * date is for that year's log. A log for another year takes today's day of
 * that year rather than its 31 December or 1 January, so its loads don't all
 * land in the December waste pool or on one day.
 *
 * @param {number} year - the summary log's year
 * @param {number} days
 * @returns {Date}
 */
export function recentDateIn(year, days) {
  const anchor = new Date()
  anchor.setUTCFullYear(year)
  const startOfYear = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1))
  const daysAgo = new Date(anchor.getTime() - days * DAY_MS)

  return faker.date.between({
    from: daysAgo > startOfYear ? daysAgo : startOfYear,
    to: anchor
  })
}

/**
 * The first of last month, kept inside the summary log's year: no later than
 * its December, which the service rejects a log for going past, and no
 * earlier than its January, so in January it is this January rather than last
 * December.
 *
 * @param {number} year - the summary log's year
 * @returns {Date}
 */
export function firstOfLastMonthIn(year) {
  const now = new Date()
  // Month 0 less one is December of the year before.
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  if (firstOfLastMonth.getFullYear() > year) {
    return new Date(year, 11, 1)
  }
  if (firstOfLastMonth.getFullYear() < year) {
    return new Date(year, 0, 1)
  }
  return firstOfLastMonth
}
