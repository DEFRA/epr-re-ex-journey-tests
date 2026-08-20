import allure from 'allure-commandline'
import { spawnSync } from 'node:child_process'
import { copyAllureCategories } from './allure-report.js'
import { defraIdStub } from './defra-id-stub.js'
import logger from './logger.js'

const oneMinute = 60 * 1000
const isLocalDev = !process.env.CI && !process.env.ENVIRONMENT
const hasJava = () =>
  spawnSync('java', ['-version'], { stdio: 'ignore' }).status === 0

export default async function globalTeardown() {
  // wdio.local.conf.js's onComplete hook used to do this after every local
  // run; carry it over so `npm run test:local` still auto-opens the report
  // instead of leaving it for a separate `npm run report` step. CI/CDP
  // Portal runs publish differently (bin/publish-tests.sh), so this stays
  // local-only, matching the original's scoping to wdio.local.conf.js.
  if (!isLocalDev) {
    await defraIdStub.expireAllUsers()
    return
  }

  await copyAllureCategories()

  if (!hasJava()) {
    logger.warn(
      'Skipping the optional local Allure report because Java is not installed. Run `npm run report` after installing Java to generate it.'
    )
    return
  }

  /** @type {Promise<void>} */
  const reportGenerated = new Promise((resolve, reject) => {
    const reportError = new Error('Could not generate Allure report')
    const generation = allure(['generate', 'allure-results', '--clean'])
    const generationTimeout = setTimeout(() => reject(reportError), oneMinute)

    generation.on('exit', (exitCode) => {
      clearTimeout(generationTimeout)

      if (exitCode !== 0) {
        return reject(reportError)
      }

      allure(['open'])
      resolve()
    })
  })

  try {
    await reportGenerated
  } catch {
    // A test result must not be turned into a failure just because the
    // optional local Allure report cannot be generated (for example, when
    // Java is not installed). Playwright still reports test failures itself.
    logger.warn(
      'Could not generate the local Allure report. Install Java to run `npm run report` manually.'
    )
  }
}
