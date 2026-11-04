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
  // sv-SE formats as YYYY-MM-DD HH:mm, which sorts chronologically.
  const stamp = now
    .toLocaleString('sv-SE', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    .replace(' ', 'T')
  const year = stamp.slice(0, 4)
  return stamp >= `${year}-${windowStart || STACK_DEFAULT_WINDOW_START}`
}
