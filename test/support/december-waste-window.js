/**
 * The window start compose.yml gives the stack when DECEMBER_WASTE_WINDOW_START
 * is unset, which leaves the window open all year.
 */
const STACK_DEFAULT_WINDOW_START = '01-01T00:00'

/**
 * Whether the December Waste declaration window is open for an accreditation
 * the journeys seed, which is always valid from 1 January this year.
 *
 * The suite reads the same DECEMBER_WASTE_WINDOW_START the stack under test
 * was given, rather than asking the backend, so a backend that gets the
 * window wrong fails the journey. The window runs from that start, as
 * MM-DDTHH:mm in UK time, until 31 January next year, so only the start can
 * fall after today.
 *
 * @param {Date} [now]
 * @param {string} [windowStart] - MM-DDTHH:mm
 * @returns {boolean}
 */
export function isDecemberWasteWindowOpen(
  now = new Date(),
  windowStart = process.env.DECEMBER_WASTE_WINDOW_START
) {
  const stamp = ukStamp(now)
  const year = stamp.slice(0, 4)
  return stamp >= `${year}-${windowStart || STACK_DEFAULT_WINDOW_START}`
}

/**
 * Whether the December Waste declaration window is open for an accreditation
 * of `relevantYear`. As the backend does, the window runs from the configured
 * start in that year through 31 January of the next, so in January the
 * previous year's window is still open.
 *
 * @param {number} relevantYear
 * @param {Date} [now]
 * @param {string} [windowStart] - MM-DDTHH:mm
 * @returns {boolean}
 */
export function isDecemberWasteWindowOpenFor(
  relevantYear,
  now = new Date(),
  windowStart = process.env.DECEMBER_WASTE_WINDOW_START
) {
  const stamp = ukStamp(now)
  return (
    stamp >= `${relevantYear}-${windowStart || STACK_DEFAULT_WINDOW_START}` &&
    stamp < `${relevantYear + 1}-02-01T00:00`
  )
}

/**
 * @param {Date} now
 * @returns {string} YYYY-MM-DDTHH:mm in UK time, which sorts chronologically
 */
function ukStamp(now) {
  return now
    .toLocaleString('sv-SE', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    .replace(' ', 'T')
}
