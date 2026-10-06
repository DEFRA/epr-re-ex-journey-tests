import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import { summariseVisualResults } from './visual-summary.js'

const artifactUrl = 'https://example.test/artifacts/1'

const screenshotFailure = `# Test info

- Name: regulator/shell.visual.e2e.js >> Page shell visual baseline @visual >> on a wide screen >> Should keep the header looking the same
- Location: test/specs/regulator/shell.visual.e2e.js:39:5

# Error details

\`\`\`
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: getByRole('banner')
  Expected an image 1280px by 162px, received 1280px by 172px. 5814 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: header-wide.png

Call log:
  - waiting for getByRole('banner')
\`\`\`

# Page snapshot
`

const ariaFailure = `# Test info

- Name: regulator/shell.visual.e2e.js >> Page shell visual baseline @visual >> on a wide screen >> Should keep the header looking the same
- Location: test/specs/regulator/shell.visual.e2e.js:39:5

# Error details

\`\`\`
Error: expect(locator).toMatchAriaSnapshot(expected) failed

Locator: getByRole('banner')
- Expected  - 1
+ Received  + 0

-     - link "Sign out"
\`\`\`

# Page snapshot
`

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} errorContext
 */
const failingTest = (dir, name, errorContext) => {
  mkdirSync(join(dir, name))
  writeFileSync(join(dir, name, 'error-context.md'), errorContext)
}

describe('summariseVisualResults', () => {
  /** @type {string} */
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'visual-summary-'))
  })

  it('says nothing when no test failed', () => {
    assert.equal(summariseVisualResults(dir, { artifactUrl }), '')
  })

  it('says nothing when the results directory does not exist', () => {
    assert.equal(
      summariseVisualResults(join(dir, 'missing'), { artifactUrl }),
      ''
    )
  })

  it('names the snapshot and how far it moved for a screenshot mismatch', () => {
    failingTest(dir, 'wide', screenshotFailure)

    const summary = summariseVisualResults(dir, { artifactUrl })

    assert.match(summary, /on a wide screen › Should keep the header/)
    assert.match(summary, /header-wide\.png/)
    assert.match(
      summary,
      /1280px by 162px, received 1280px by 172px\. 5814 pixels/
    )
  })

  it('links the artifact holding the expected, actual and diff images', () => {
    failingTest(dir, 'wide', screenshotFailure)

    assert.ok(
      summariseVisualResults(dir, { artifactUrl }).includes(`(${artifactUrl})`)
    )
  })

  it('keeps the whole diff of an aria mismatch where a reader can open it', () => {
    failingTest(dir, 'wide', ariaFailure)

    const summary = summariseVisualResults(dir, { artifactUrl })

    assert.match(summary, /toMatchAriaSnapshot\(expected\) failed/)
    assert.match(summary, /<details>/)
    assert.match(summary, /- {5}- link "Sign out"/)
  })

  it('counts every failing test', () => {
    failingTest(dir, 'wide', screenshotFailure)
    failingTest(dir, 'narrow', ariaFailure)

    assert.match(summariseVisualResults(dir, { artifactUrl }), /2 snapshots/)
  })
})
