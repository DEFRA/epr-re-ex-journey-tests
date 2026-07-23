import { expect } from 'chai'
import { DockerLogParser } from './docker.log.parser.js'
import logger from './logger.js'
import config from '../config/config.js'

// Ported from epr-backend-journey-tests' logging.steps.js. That version reads
// a Cucumber World's DataTable and interpolates `{{summaryLogId}}`-style
// placeholders from scenario context; here call sites just pass the real
// values they already have in scope, so no templating layer is needed.
//
// Both assertions read `docker logs` for the epr-backend compose service, so
// they only make sense against the local compose stack - config.testLogs is
// false against a deployed environment (or with WITHOUT_LOGS set locally),
// in which case they no-op with a warning rather than failing the test.
const dockerLogParser = new DockerLogParser(
  config.dockerLogParser.containerName
)

/**
 * @param {{ level: string, eventAction: string, message: string }} expected
 */
export async function assertLogMessage({ level, eventAction, message }) {
  if (!config.testLogs) {
    logger.warn(
      { step: 'assertLogMessage' },
      'Skipping docker logging assertion'
    )
    return
  }

  const logs = await dockerLogParser.waitForLog(message)
  if (logs.length > 1) {
    const actualLogs = logs
      .filter((log) => log['log.level'] === level && log.message != null)
      .map((log) => log.message)
      .join('\n')
    expect.fail(
      `No log found for the following expected log message: ${message}\nActual logs: ${actualLogs}`
    )
  }

  const actualLog = logs[0]
  expect(actualLog['log.level']).to.equal(level)
  expect(actualLog.event?.action).to.equal(eventAction)
  expect(actualLog.message).to.contain(message)
}

function matchesAuditExpectation(log, expected) {
  const {
    eventCategory,
    eventAction,
    eventSubCategory,
    contextKeys,
    contextValues
  } = expected

  const contextValuesMatch = contextValues
    ? contextValues.every((value) =>
        JSON.stringify(log.context).includes(value)
      )
    : true

  const subCategoryMatches = eventSubCategory
    ? log.event.subCategory === eventSubCategory
    : true

  return (
    log.event.category === eventCategory &&
    log.event.action === eventAction &&
    Object.keys(log.context).join(', ') === contextKeys.join(', ') &&
    contextValuesMatch &&
    subCategoryMatches
  )
}

/**
 * Checks one or more expected audit-log shapes against `docker logs`, all
 * against a SHARED poll/accumulation loop. Must be batched together (rather
 * than called once per expectation) whenever the expectations describe
 * audit lines emitted by the same underlying action/request: DockerLogParser
 * dedupes every audit line it has ever returned (across ALL calls, not just
 * this one), so a line consumed - and discarded as a non-match - while
 * polling for expectation A would never reappear for a later, separate call
 * checking expectation B, even if it matched B all along.
 *
 * @param {Array<{
 *   eventCategory: string,
 *   eventAction: string,
 *   eventSubCategory?: string,
 *   contextKeys: string[],
 *   count: number,
 *   contextValues?: string[]
 * }>} expectedList
 */
export async function assertAuditLogs(
  expectedList,
  { timeout = 30000, interval = 250 } = {}
) {
  if (!config.testLogs) {
    logger.warn(
      { step: 'assertAuditLogs' },
      'Skipping docker audit log assertion'
    )
    return
  }

  const startTime = Date.now()
  const accumulatedLogs = []
  let unmet = expectedList

  do {
    accumulatedLogs.push(...(await dockerLogParser.retrieveAuditLogs()))

    unmet = expectedList.filter((expected) => {
      const matchCount = accumulatedLogs.filter((log) =>
        matchesAuditExpectation(log, expected)
      ).length
      return matchCount !== expected.count
    })

    if (unmet.length === 0) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  } while (Date.now() - startTime < timeout)

  const details = unmet
    .map((expected) => {
      const matchCount = accumulatedLogs.filter((log) =>
        matchesAuditExpectation(log, expected)
      ).length
      return `Expected ${expected.count} audit logs for event category '${expected.eventCategory}'/action '${expected.eventAction}'. Found ${matchCount}.`
    })
    .join('\n')

  expect.fail(
    `${details}\nActual audit logs: ${JSON.stringify(accumulatedLogs)}`
  )
}

/**
 * Single-expectation convenience wrapper around {@link assertAuditLogs} for
 * the common case of one audit check per call site.
 *
 * @param {{
 *   eventCategory: string,
 *   eventAction: string,
 *   eventSubCategory?: string,
 *   contextKeys: string[],
 *   count: number,
 *   contextValues?: string[]
 * }} expected
 */
export async function assertAuditLog(expected) {
  await assertAuditLogs([expected])
}
