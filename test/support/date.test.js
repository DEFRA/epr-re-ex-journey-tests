import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const preload = join(here, 'simulator', 'clock', 'fake-clock.cjs')
const scratch = mkdtempSync(join(tmpdir(), 'date-'))
const clockFile = join(scratch, 'clock.txt')

after(() => rmSync(scratch, { recursive: true, force: true }))

/**
 * @param {string} instant
 * @param {string} module
 * @param {string} name
 */
const exportedAt = (instant, module, name) => {
  writeFileSync(clockFile, instant)
  return execFileSync(
    process.execPath,
    [
      '--require',
      preload,
      '--input-type=module',
      '-e',
      `const m = await import('${join(here, module)}')
       const value = m['${name}']
       console.log(typeof value === 'function' ? value() : value)`
    ],
    {
      env: { ...process.env, FAKE_CLOCK_FILE: clockFile },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim()
}

const instants = [
  { instant: '2026-06-15T12:00:00Z', year: '2026' },
  { instant: '2027-12-31T23:59:00Z', year: '2027' },
  { instant: '2028-01-01T00:00:30Z', year: '2028' }
]

describe('the current year', () => {
  for (const { instant, year } of instants) {
    it(`should be ${year} at ${instant}`, () => {
      assert.equal(exportedAt(instant, 'date.js', 'currentYear'), year)
    })

    it(`should start seeded organisations on 1 january ${year} at ${instant}`, () => {
      assert.equal(
        exportedAt(instant, 'seeding/organisation.js', 'SEEDED_VALID_FROM'),
        `${year}-01-01`
      )
    })
  }
})
