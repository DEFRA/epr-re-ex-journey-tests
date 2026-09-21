/**
 * Plans a run from its settings: the population, its rows, its calendar and
 * every event in order. A resumed run and an end-of-run summary replan from
 * the saved settings, and this is what both of them and a fresh run share.
 */

import { createHash } from 'node:crypto'

import { planCalendar } from '../calendar/calendar.js'
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import { eventsInOrder } from './runner.js'

/** @import {Calibration} from '../population/calibration.js' */
/** @import {RunSettings} from './journal.js' */

/**
 * What a calibration plans: two calibrations with the same fingerprint plan
 * the same run.
 *
 * @param {Calibration} calibration
 */
export const fingerprintOf = (calibration) =>
  createHash('sha256').update(JSON.stringify(calibration)).digest('hex')

/**
 * @param {Object} options
 * @param {Omit<RunSettings, 'calibration'>} options.settings - the plan's settings; a fingerprint beside them is ignored in favour of the calibration itself
 * @param {Calibration} options.calibration
 */
export function planRun({ settings, calibration }) {
  const population = planPopulation({ ...settings, calibration })
  const rows = planSummaryLogRows({ population, calibration })
  const calendar = planCalendar({
    population,
    rows,
    from: settings.from,
    to: settings.to,
    calibration
  })
  return { population, rows, calendar, events: eventsInOrder(calendar) }
}
