import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import logger from './logger.js'

const cleanupFilePath = resolve(
  process.cwd(),
  'test-artifacts',
  'created-org-ids.txt'
)

// Playwright Test runs spec files in separate worker processes, so an
// in-memory Map (like defraIdStub.accessTokens) populated during a test only
// exists in that worker - it's invisible to globalTeardown, which runs in a
// different process. Tracking to a shared file (like created-org-ids.txt
// already does for orgIds) is the only way teardown can see IDs recorded
// across every worker.
const loggedInUserIdsFilePath = resolve(
  process.cwd(),
  'test-artifacts',
  'logged-in-user-ids.txt'
)

function ensureDir(filePath) {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Appends an id to the given tracker file. Called on every successful
 * creation/login so it can be cleaned up/expired after the run.
 *
 * Uses appendFileSync because POSIX guarantees atomic writes for small payloads
 * under PIPE_BUF (4096 bytes), so appends are safe even under concurrent
 * worker processes.
 *
 * Swallows write errors — never fail a test because the tracker couldn't write.
 */
function appendId(filePath, id, label) {
  if (!id) {
    return
  }
  try {
    ensureDir(filePath)
    appendFileSync(filePath, `${id}\n`)
  } catch (err) {
    logger.warn(
      `cleanup-tracker: failed to record ${label} ${id}: ${err.message}`
    )
  }
}

function readIds(filePath) {
  try {
    if (!existsSync(filePath)) {
      return []
    }
    const ids = readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return [...new Set(ids)]
  } catch (err) {
    logger.warn(`cleanup-tracker: failed to read ${filePath}: ${err.message}`)
    return []
  }
}

function resetFile(filePath) {
  try {
    ensureDir(filePath)
    writeFileSync(filePath, '')
  } catch (err) {
    logger.warn(`cleanup-tracker: failed to reset ${filePath}: ${err.message}`)
  }
}

export function trackCreatedOrgId(orgId) {
  appendId(cleanupFilePath, orgId, 'orgId')
}

export function trackLoggedInUserId(userId) {
  appendId(loggedInUserIdsFilePath, userId, 'userId')
}

export function readLoggedInUserIds() {
  return readIds(loggedInUserIdsFilePath)
}

/**
 * Wipes the cleanup files at the start of a run. Prevents stale IDs from a
 * previous local run appearing in the cleanup log.
 */
export function resetTracker() {
  resetFile(cleanupFilePath)
  resetFile(loggedInUserIdsFilePath)
}

export { cleanupFilePath, loggedInUserIdsFilePath }
