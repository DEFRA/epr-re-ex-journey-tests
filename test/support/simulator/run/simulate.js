/**
 * Runs the operator activity simulator: plans a population, its rows and its
 * calendar, then replays the calendar against the local stack under the
 * simulated clock. Bring the stack up on the clock (see ../clock/README.md),
 * then:
 *
 *   npm run simulate -- --scale 0.1
 *
 * See README.md beside this file for the settings, resuming and the manifest.
 */

import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import config from '../../../config/config.js'
import logger from '../../logger.js'
import { planCalendar } from '../calendar/calendar.js'
import { clearSimulatedClock } from '../clock/simulated-clock.js'
import { createRun } from '../execute/execute.js'
import { loadCalibration } from '../population/calibration.js'
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import {
  appendJournal,
  entryFor,
  manifestOf,
  readJournal,
  readSettings,
  restore,
  writeManifest,
  writeSettings
} from './journal.js'
import { createStop, eventKey, eventsInOrder, replay } from './runner.js'

/** @import {RunSettings} from './journal.js' */

const DEFAULT_SEED = 'pepr'
const DEFAULT_CONCURRENCY = 4
const RUNS_DIRECTORY = 'test-artifacts/simulator'

/** How long the preload takes to notice the clock file has gone. */
const CLOCK_SETTLE_MS = 500

/** The exit status of a run stopped by a signal, as a shell reports one. */
const INTERRUPTED_EXIT_CODE = 130

/** @param {string[]} argv */
export function parseSettings(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      scale: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      'profile-mix': { type: 'string' },
      concurrency: { type: 'string' },
      dir: { type: 'string' }
    }
  })
  const number = (name, text) => {
    if (text === undefined) return undefined
    const value = Number(text)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`--${name} must be a number above zero, not "${text}"`)
    }
    return value
  }
  return {
    seed: values.seed,
    scale: number('scale', values.scale),
    from: values.from,
    to: values.to,
    profileMix: values['profile-mix'],
    concurrency: number('concurrency', values.concurrency),
    dir: values.dir
  }
}

/**
 * The settings a run in `directory` is planned from: what was asked for,
 * over what a run already there was planned from. A run resumes only as it
 * was planned, so asking for anything different is refused.
 *
 * @param {ReturnType<typeof parseSettings>} asked
 * @param {RunSettings | null} saved
 * @param {() => string} today
 * @returns {RunSettings}
 */
export function settleSettings(asked, saved, today) {
  /** @type {Partial<RunSettings>} */
  const wanted = {
    seed: asked.seed,
    scale: asked.scale,
    profileMix: asked.profileMix,
    from: asked.from,
    to: asked.to
  }
  if (saved) {
    const changed = Object.entries(wanted).filter(
      ([name, value]) => value !== undefined && value !== saved[name]
    )
    if (changed.length > 0) {
      throw new Error(
        `The run in progress was planned with ${changed
          .map(([name]) => `${name} ${JSON.stringify(saved[name])}`)
          .join(', ')}; resume it as it was, or run in another directory`
      )
    }
    return saved
  }
  const calibration = loadCalibration()
  return {
    seed: wanted.seed ?? DEFAULT_SEED,
    scale: wanted.scale ?? 1,
    profileMix: wanted.profileMix ?? 'production',
    from: wanted.from ?? calibration.register.activeFrom.goLive,
    to: wanted.to ?? today()
  }
}

async function main() {
  const asked = parseSettings(process.argv.slice(2))
  const seed = asked.seed ?? DEFAULT_SEED
  const directory = asked.dir ?? `${RUNS_DIRECTORY}/${seed}`
  const saved = readSettings(directory)

  if (!saved) {
    // A fresh run starts from the day the plan begins, so the stack comes off
    // any earlier run's clock, and the day this one plans to is the real one.
    clearSimulatedClock()
    await new Promise((resolve) => setTimeout(resolve, CLOCK_SETTLE_MS))
  }
  const settings = settleSettings(asked, saved, () =>
    new Date().toISOString().slice(0, 10)
  )
  if (!saved) writeSettings(directory, settings)

  const calibration = loadCalibration()
  const population = planPopulation({ ...settings, calibration })
  const rows = planSummaryLogRows({ population, calibration })
  const calendar = planCalendar({
    population,
    rows,
    from: settings.from,
    to: settings.to,
    calibration
  })
  const events = eventsInOrder(calendar)
  const run = createRun({ population, rows })
  const done = restore(run, readJournal(directory), events)
  logger.info(
    `${saved ? 'Resuming' : 'Starting'} ${seed} at scale ${settings.scale}, ${settings.from} to ${settings.to}: ` +
      `${population.organisations.length} operators, ${events.length} events, ${done.size} done, in ${directory}`
  )

  const stop = createStop()
  const interrupt = (signal) => {
    if (stop.requested()) process.exit(INTERRUPTED_EXIT_CODE)
    logger.warn(`${signal}: finishing the events under way, then stopping`)
    stop.request('interrupted')
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)

  const concurrency = asked.concurrency ?? DEFAULT_CONCURRENCY
  const writeManifestNow = () =>
    writeManifest(
      directory,
      manifestOf({
        run,
        settings,
        defraIdStub: config.defraIdUri,
        events: { done: done.size, total: events.length }
      })
    )

  try {
    await replay({
      run,
      events,
      done,
      concurrency,
      stop,
      onExecuted: (event) => {
        appendJournal(directory, entryFor(run, event))
        done.add(eventKey(event))
        logger.info(
          `${event.at}  ${event.registrationId}  ${event.type}  (${done.size}/${events.length})`
        )
      }
    })
  } finally {
    const manifest = writeManifestNow()
    logger.info(`Manifest at ${manifest}`)
  }

  if (stop.reason() === 'interrupted') {
    logger.warn(
      `Stopped after ${done.size} of ${events.length} events; run again to resume`
    )
    process.exitCode = INTERRUPTED_EXIT_CODE
    return
  }
  logger.info(
    `Done: ${events.length} events, simulated now ${new Date().toISOString()}`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
