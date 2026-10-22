import { currentYear } from '../date.js'
import { registrationPath } from './natural-key-paths.js'

/**
 * The backend reporting calendar for a registration's year. The operator's
 * reports list reads the current year's.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {number} [year]
 */
export async function yearCalendarPath(
  refNo,
  registrationId,
  year = currentYear()
) {
  return `${await registrationPath(refNo, registrationId)}/reports/${year}/calendar`
}

/**
 * The year calendar answers registered-only and accredited periods apart;
 * either is absent when the registration has none of it in the year.
 *
 * @param {{
 *   registeredOnly?: { reportingPeriods: object[] },
 *   accredited?: { reportingPeriods: object[] }
 * }} calendar
 * @returns {any[]}
 */
export const reportingPeriodsOf = ({ registeredOnly, accredited }) => [
  ...(registeredOnly?.reportingPeriods ?? []),
  ...(accredited?.reportingPeriods ?? [])
]
