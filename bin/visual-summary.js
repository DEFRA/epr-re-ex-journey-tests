import { writeFileSync } from 'node:fs'

import { summariseVisualResults } from '../test/support/visual-summary/visual-summary.js'

const [resultsDir, outputFile] = process.argv.slice(2)

writeFileSync(
  outputFile,
  summariseVisualResults(resultsDir, {
    artifactUrl: process.env.ARTIFACT_URL ?? ''
  })
)
