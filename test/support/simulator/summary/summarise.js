/**
 * The end-of-run calibration summary: what a run generated, next to what the
 * calibration it was planned with asked for at its scale, and the ratio.
 * `simulate.js` prints it when a run completes; to print it for a run
 * directory at any time:
 *
 *   npm run simulate:summary -- --dir test-artifacts/simulator/pepr
 *
 * See README.md beside this file for what each section measures and where
 * the generated figures come from.
 */

import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import logger from '../../logger.js'
import { createRun } from '../execute/execute.js'
import { loadCalibration } from '../population/calibration.js'
import { readJournal, readSettings, restore } from '../run/journal.js'
import { fingerprintOf, planRun } from '../run/plan.js'
import { eventKey } from '../run/runner.js'
import { format, measure, reachedDay } from './measure.js'
import { readServiceView } from './service.js'

/** @import {Calibration} from '../population/calibration.js' */
/** @import {RunSettings} from '../run/journal.js' */
/** @import {Run} from '../execute/execute.js' */

/**
 * The summary of a run, as text.
 *
 * @param {Object} options
 * @param {RunSettings} options.settings
 * @param {Calibration} options.calibration - the one the run was planned with
 * @param {ReturnType<typeof planRun>} options.plan
 * @param {Run} options.run - what the service holds of the plan
 * @param {Set<string>} options.done - keys of the events executed
 */
export async function summarise({ settings, calibration, plan, run, done }) {
  const service = await readServiceView(run)
  const executed = plan.events.filter((event) => done.has(eventKey(event)))
  const heading =
    `# ${settings.seed} at scale ${settings.scale}, ${settings.from} to ${settings.to}: ` +
    `${done.size} of ${plan.events.length} events executed, reached ${reachedDay(executed, settings)}`
  const sections = measure({
    settings,
    calibration,
    population: plan.population,
    rows: plan.rows,
    events: plan.events,
    done,
    run,
    service
  })
  return `${heading}\n\n${format(sections)}`
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { dir: { type: 'string' } }
  })
  if (!values.dir) throw new Error('--dir names the run directory to summarise')
  const settings = readSettings(values.dir)
  if (!settings) throw new Error(`${values.dir} holds no run`)
  const calibration = loadCalibration()
  if (fingerprintOf(calibration) !== settings.calibration) {
    throw new Error(
      'The run was planned under another calibration; summarise it under the same one'
    )
  }
  const plan = planRun({ settings, calibration })
  const run = createRun({ population: plan.population, rows: plan.rows })
  const done = restore(run, readJournal(values.dir), plan.events)
  process.stdout.write(
    `${await summarise({ settings, calibration, plan, run, done })}\n`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
