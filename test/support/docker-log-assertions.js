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

/**
 * @param {{
 *   eventCategory: string,
 *   eventAction: string,
 *   eventSubCategory?: string,
 *   contextKeys: string[],
 *   count: number,
 *   contextValues?: string[]
 * }} expected
 */
export async function assertAuditLog({
  eventCategory,
  eventAction,
  eventSubCategory,
  contextKeys,
  count,
  contextValues
}) {
  if (!config.testLogs) {
    logger.warn(
      { step: 'assertAuditLog' },
      'Skipping docker audit log assertion'
    )
    return
  }

  const actualLogs = await dockerLogParser.retrieveAuditLogs()

  const filtered = actualLogs.filter((log) => {
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
  })

  if (filtered.length !== count) {
    expect.fail(
      `Expected ${count} audit logs for event category '${eventCategory}'/action '${eventAction}'. Found ${filtered.length}. Actual audit logs: ${JSON.stringify(actualLogs)}`
    )
  }
}
