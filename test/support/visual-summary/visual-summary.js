import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @param {string} errorContext
 * @returns {string}
 */
const errorDetails = (errorContext) =>
  (errorContext.match(/# Error details\s+```\n([\s\S]*?)```/)?.[1] ?? '')
    .split('\nCall log:')[0]
    .trimEnd()

/**
 * @param {string} errorContext
 * @returns {string}
 */
const testName = (errorContext) =>
  (errorContext.match(/^- Name: (.*)$/m)?.[1] ?? 'unknown test')
    .split(' >> ')
    .slice(1)
    .join(' › ')

/**
 * What moved: the size and pixel count for a screenshot, otherwise the line
 * that names the kind of mismatch.
 * @param {string} details
 * @returns {string}
 */
const change = (details) =>
  details.match(/Expected an image .*are different\./)?.[0] ??
  details.split('\n')[0].replace(/^Error: /, '')

/**
 * @param {{ details: string, name: string }} failure
 * @returns {string}
 */
const tableRow = ({ details, name }) =>
  `| ${name} | ${details.match(/Snapshot: (.*)/)?.[1] ?? '-'} | ${change(details)} |`

/**
 * @param {{ details: string, name: string }} failure
 * @returns {string}
 */
const detailsBlock = ({ details, name }) =>
  `<details>\n<summary>${name}</summary>\n\n\`\`\`\n${details}\n\`\`\`\n\n</details>`

/**
 * Markdown for the snapshot specs that failed in a Playwright output
 * directory, or an empty string when none did.
 * @param {string} resultsDir
 * @param {{ artifactUrl: string }} options
 * @returns {string}
 */
export const summariseVisualResults = (resultsDir, { artifactUrl }) => {
  if (!existsSync(resultsDir)) {
    return ''
  }

  const failures = readdirSync(resultsDir)
    .map((entry) => join(resultsDir, entry, 'error-context.md'))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .map((errorContext) => ({
      details: errorDetails(errorContext),
      name: testName(errorContext)
    }))

  if (failures.length === 0) {
    return ''
  }

  const count = `${failures.length} snapshot${failures.length === 1 ? '' : 's'}`

  return [
    '### Visual snapshots changed',
    `${count} differ from the baselines. The expected, actual and diff images are in the [visual results artifact](${artifactUrl}).`,
    [
      '| Test | Snapshot | Change |',
      '| --- | --- | --- |',
      ...failures.map(tableRow)
    ].join('\n'),
    ...failures.map(detailsBlock)
  ].join('\n\n')
}
