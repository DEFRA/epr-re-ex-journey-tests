import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import logger from '../../logger.js'

/**
 * The instant the stack believes is now. Written here, read by the fake-clock
 * preload in this process and in every Node container that mounts this
 * directory. Its mtime is what anchors the offset, so it is rewritten in place
 * and never renamed over.
 */
export const clockFile = join(
  dirname(fileURLToPath(import.meta.url)),
  'clock.txt'
)

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
  writeFileSync(clockFile, target.toISOString())
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
