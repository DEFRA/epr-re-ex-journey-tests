import { fakerEN_GB as faker } from '@faker-js/faker'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A random date within the last `days` days, but not before 1 January this
 * year. An accredited load dated last year falls outside an accreditation
 * that starts this year, and the backend ignores it.
 *
 * @param {number} days
 * @returns {Date}
 */
export function recentDateThisYear(days) {
  const now = new Date()
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const daysAgo = new Date(now.getTime() - days * DAY_MS)

  return faker.date.between({
    from: daysAgo > startOfYear ? daysAgo : startOfYear,
    to: now
  })
}
