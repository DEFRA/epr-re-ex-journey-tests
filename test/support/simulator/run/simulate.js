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

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import config from '../../../config/config.js'
import logger from '../../logger.js'
import { clearSimulatedClock, clockFile } from '../clock/simulated-clock.js'
import { createRun, executeEvent } from '../execute/execute.js'
import { loadCalibration } from '../population/calibration.js'
import { summarise } from '../summary/summarise.js'
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
import { fingerprintOf, planRun } from './plan.js'
import { clockSettled, createStop, eventKey, replay } from './runner.js'

/** @import {Calibration} from '../population/calibration.js' */
/** @import {RunSettings} from './journal.js' */

const DEFAULT_SEED = 'pepr'
const DEFAULT_CONCURRENCY = 4
const RUNS_DIRECTORY = 'test-artifacts/simulator'

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
  /**
   * @param {string} name
   * @param {string | undefined} text
   * @param {{whole?: boolean}} [options]
   */
  const number = (name, text, { whole = false } = {}) => {
    if (text === undefined) return undefined
    const value = Number(text)
    const wellFormed = whole ? Number.isInteger(value) : Number.isFinite(value)
    if (!wellFormed || value <= 0) {
      throw new Error(
        `--${name} must be a ${whole ? 'whole ' : ''}number above zero, not "${text}"`
      )
    }
    return value
  }
  /**
   * @param {string} name
   * @param {string | undefined} text
   */
  const date = (name, text) => {
    if (text === undefined) return undefined
    const wellFormed =
      /^\d{4}-\d{2}-\d{2}$/.test(text) &&
      !Number.isNaN(Date.parse(text)) &&
      new Date(text).toISOString().startsWith(text)
    if (!wellFormed) {
      throw new Error(`--${name} must be a date as YYYY-MM-DD, not "${text}"`)
    }
    return text
  }
  return {
    seed: values.seed,
    scale: number('scale', values.scale),
    from: date('from', values.from),
    to: date('to', values.to),
    profileMix: values['profile-mix'],
    concurrency: number('concurrency', values.concurrency, { whole: true }),
    dir: values.dir
  }
}

/**
 * The settings a run in `directory` is planned from: what was asked for,
 * over what a run already there was planned from. A run resumes only as it
 * was planned, so asking for anything different, or planning under another
 * calibration, is refused.
 *
 * @param {ReturnType<typeof parseSettings> & {calibration: string}} asked - with the fingerprint of the calibration in force
 * @param {RunSettings | null} saved
 * @param {{from: string, to: string}} defaults - the period a fresh run covers when none is asked for
 * @returns {RunSettings}
 */
export function settleSettings(asked, saved, defaults) {
  /** @type {Partial<RunSettings>} */
  const wanted = {
    seed: asked.seed,
    scale: asked.scale,
    profileMix: asked.profileMix,
    from: asked.from,
    to: asked.to,
    calibration: asked.calibration
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
  return {
    seed: wanted.seed ?? DEFAULT_SEED,
    scale: wanted.scale ?? 1,
    profileMix: wanted.profileMix ?? 'production',
    from: wanted.from ?? defaults.from,
    to: wanted.to ?? defaults.to,
    calibration: asked.calibration
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
    if (existsSync(clockFile)) {
      logger.warn(
        `The stack was on the clock at ${new Date().toISOString()} and is taken off it; what it holds keeps its stamps, so bring it up fresh for a clean run`
      )
    }
    clearSimulatedClock()
    await clockSettled()
  }
  const calibration = loadCalibration()
  const settings = settleSettings(
    { ...asked, calibration: fingerprintOf(calibration) },
    saved,
    {
      from: calibration.register.activeFrom.goLive,
      to: new Date().toISOString().slice(0, 10)
    }
  )

  const plan = planRun({ settings, calibration })
  const { population, rows, events } = plan
  const run = createRun({ population, rows })
  const done = restore(run, readJournal(directory), events)
  if (!saved) writeSettings(directory, settings)
  logger.info(
    `${saved ? 'Resuming' : 'Starting'} ${settings.seed} at scale ${settings.scale}, ${settings.from} to ${settings.to}: ` +
      `${population.organisations.length} operators, ${events.length} events, ${done.size} done, in ${directory}`
  )

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

  // Real seconds, which the simulated Date cannot give.
  /** @type {Map<string, number>} */
  const startedAt = new Map()

  const stop = createStop()
  let signalled = false
  /** @param {NodeJS.Signals} signal */
  const interrupt = (signal) => {
    if (signalled) {
      logger.warn(
        `${signal} again: ${startedAt.size} events under way are left unjournalled, and done again on resume`
      )
      writeManifestNow()
      process.exit(INTERRUPTED_EXIT_CODE)
    }
    signalled = true
    logger.warn(`${signal}: finishing the events under way, then stopping`)
    stop.request('interrupted')
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)

  try {
    await replay({
      run,
      events,
      done,
      concurrency,
      stop,
      execute: (aRun, event) => {
        startedAt.set(eventKey(event), performance.now())
        return executeEvent(aRun, event)
      },
      onExecuted: (event) => {
        const key = eventKey(event)
        appendJournal(directory, entryFor(run, event))
        done.add(key)
        const took = (performance.now() - (startedAt.get(key) ?? 0)) / 1000
        startedAt.delete(key)
        logger.info(
          `${event.at}  ${event.registrationId}  ${event.type}  ${took.toFixed(1)}s  (${done.size}/${events.length})`
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
  try {
    process.stdout.write(
      `\n${await summarise({ settings, calibration, plan, run, done })}\n`
    )
  } catch (error) {
    logger.error(error)
    logger.error(
      `The run completed; the summary did not. Print it again with: npm run simulate:summary -- --dir ${directory}`
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
