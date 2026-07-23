import allure from 'allure-commandline'
import { defraIdStub } from './defra-id-stub.js'

const oneMinute = 60 * 1000
const isLocalDev = !process.env.CI && !process.env.ENVIRONMENT

export default async function globalTeardown() {
  await defraIdStub.expireAllUsers()

  // wdio.local.conf.js's onComplete hook used to do this after every local
  // run; carry it over so `npm run test:local` still auto-opens the report
  // instead of leaving it for a separate `npm run report` step. CI/CDP
  // Portal runs publish differently (bin/publish-tests.sh), so this stays
  // local-only, matching the original's scoping to wdio.local.conf.js.
  if (!isLocalDev) {
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

  await reportGenerated
}
