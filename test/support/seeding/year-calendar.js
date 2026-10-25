import { BaseAPI } from '../../apis/base-api.js'
import { assertSuccessResponse } from '../response-assertions.js'

/**
 * @typedef {{
 *   organisationNumber: number,
 *   registrationNumber: string,
 *   year: number
 * }} RegistrationYearKeys
 */

/**
 * The backend reporting calendar for a registration's year.
 *
 * @param {RegistrationYearKeys} keys
 */
export const yearCalendarPath = ({
  organisationNumber,
  registrationNumber,
  year
}) =>
  `/organisations/${organisationNumber}/registrations/${encodeURIComponent(registrationNumber)}/reports/${year}/calendar`

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

/**
 * A registration's reporting calendar for the year, as the operator reads it.
 *
 * @param {RegistrationYearKeys} keys
 * @param {{ Authorization?: string }} defraAuthHeader
 * @returns {Promise<{
 *   registeredOnly?: { reportingPeriods: { year: number }[] },
 *   accredited?: { reportingPeriods: { year: number }[] }
 * }>}
 */
export async function fetchYearCalendar(keys, defraAuthHeader) {
  const path = yearCalendarPath(keys)
  return assertSuccessResponse(
    await new BaseAPI().get(path, defraAuthHeader),
    `GET ${path}`
  )
}
