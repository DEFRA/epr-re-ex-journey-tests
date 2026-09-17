import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import logger from '../../logger.js'

/**
 * The instant the stack believes is now. Written here, read by the fake-clock
 * preload in this process and in every Node container that mounts this
 * directory. A process pointed at another copy through FAKE_CLOCK_FILE is
 * controlled through that one instead.
 */
export const clockFile =
  process.env.FAKE_CLOCK_FILE ??
  join(dirname(fileURLToPath(import.meta.url)), 'clock.txt')

/**
 * Move the whole stack to an instant. Takes effect within a quarter of a
 * second, everywhere, without restarting anything.
 *
 * @param {Date | string} instant
 */
export const setSimulatedNow = (instant) => {
  const target = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(target.getTime())) {
    throw new Error(`Cannot simulate "${instant}": not a date`)
  }
  // Written aside and renamed into place, because a reader that catches the
  // file between truncation and write reads an empty one and falls back to
  // real time. The replacement carries its own mtime, which is what anchors
  // the offset.
  const pending = `${clockFile}.${process.pid}`
  writeFileSync(pending, target.toISOString())
  renameSync(pending, clockFile)
  return target
}

/** Hand the stack back to real time. */
export const clearSimulatedClock = () => {
  rmSync(clockFile, { force: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [instant] = process.argv.slice(2)
  if (!instant) {
    logger.error('Usage: npm run clock -- <date | off>')
    process.exit(1)
  }
  if (instant === 'off') {
    clearSimulatedClock()
    logger.info('Simulated clock off; the stack is back on real time.')
  } else {
    logger.info(`Simulated now is ${setSimulatedNow(instant).toISOString()}`)
  }
}
