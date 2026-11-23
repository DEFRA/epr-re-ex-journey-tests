export const todayddMMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

export const currentYear = () => new Date().getUTCFullYear()

// The backend runs with OPEN_NEXT_YEAR in this stack and the lower envs.
export const latestOpenYear = () => currentYear() + 1

export const MONTHS_OF_THE_YEAR = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/**
 * Whether PRNs and PERNs can still be raised for an accreditation of
 * `relevantYear`. As the backend does, in UTC, the year stays open until the
 * end of 31 January after it.
 *
 * A copy of the backend's rule, to be removed for the backend's own answer
 * once PAE-2016 (the end of accreditations on 31 January) is done.
 *
 * @param {number} relevantYear
 * @param {Date} [now]
 * @returns {boolean}
 */
export const isRelevantYearOpen = (relevantYear, now = new Date()) =>
  now.getTime() <= Date.UTC(relevantYear + 1, 0, 31, 23, 59, 59, 999)
