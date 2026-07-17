import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import logger from './logger.js'

const cleanupFilePath = resolve(
  process.cwd(),
  'test-artifacts',
  'created-org-ids.txt'
)

function ensureDir() {
  const dir = dirname(cleanupFilePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Appends an orgId to the cleanup file. Called on every successful org creation
 * so entrypoint.sh can delete them after the run.
 *
 * Uses appendFileSync because POSIX guarantees atomic writes for small payloads
 * under PIPE_BUF (4096 bytes). A 6-digit orgId + newline is 7 bytes, so
 * appends are safe even under concurrent workers.
 *
 * Swallows write errors — never fail a test because the tracker couldn't write.
 */
export function trackCreatedOrgId(orgId) {
  if (!orgId) {
    return
  }
  try {
    ensureDir()
    appendFileSync(cleanupFilePath, `${orgId}\n`)
  } catch (err) {
    logger.warn(
      `cleanup-tracker: failed to record orgId ${orgId}: ${err.message}`
    )
  }
}

/**
 * Wipes the cleanup file at the start of a run. Prevents stale IDs from a
 * previous local run appearing in the cleanup log.
 */
export function resetTracker() {
  try {
    ensureDir()
    writeFileSync(cleanupFilePath, '')
  } catch (err) {
    logger.warn(`cleanup-tracker: failed to reset tracker: ${err.message}`)
  }
}

export { cleanupFilePath }
