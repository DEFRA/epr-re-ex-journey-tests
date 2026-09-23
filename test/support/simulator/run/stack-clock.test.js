import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const preload = join(here, '../clock/fake-clock.cjs')
const runner = join(here, 'runner.js')
const clock = join(here, '../clock/simulated-clock.js')
const scratch = mkdtempSync(join(tmpdir(), 'stack-clock-'))
const clockFile = join(scratch, 'clock.txt')

// Read when the module loads, so the clock under test is the scratch one
// rather than the repository's own stack's.
process.env.FAKE_CLOCK_FILE = clockFile
const { stackClock } = await import('./runner.js')

after(() => rmSync(scratch, { recursive: true, force: true }))

/**
 * Runs the script in a process on the simulated clock, as the runner is
 * under `npm run simulate`, and returns what it printed.
 *
 * @param {string} script
 */
const runOnTheClock = (script) =>
  execFileSync(
    process.execPath,
    ['--require', preload, '--input-type=module', '-e', script],
    {
      env: { ...process.env, FAKE_CLOCK_FILE: clockFile },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim()

describe('the stack clock', () => {
  it('moves the stack to the instant and reads it there', () => {
    rmSync(clockFile, { force: true })

    const now = runOnTheClock(`
      const { stackClock } = await import(${JSON.stringify(runner)})
      await stackClock.moveTo('2026-02-16T17:30:00Z')
      console.log(new Date().toISOString())
    `)

    assert.equal(now.slice(0, 16), '2026-02-16T17:30')
  })

  it('leaves a stack that has passed the day where it stands, and says so', () => {
    const printed = runOnTheClock(`
      const { stackClock } = await import(${JSON.stringify(runner)})
      const { setSimulatedNow } = await import(${JSON.stringify(clock)})
      setSimulatedNow('2026-02-16T17:30:00Z')
      await stackClock.moveTo('2026-02-10T17:30:00Z')
      console.log(new Date().toISOString())
    `).split('\n')

    // logger.warn writes to stdout asynchronously (pino's default), so it
    // can land before or after console.log's line: find the date by its
    // shape rather than assuming it printed last.
    const now =
      printed.findLast((line) => /^\d{4}-\d{2}-\d{2}T/.test(line)) ?? ''
    assert.equal(now.slice(0, 16), '2026-02-16T17:30')
    assert.match(
      printed.join('\n'),
      /The stack has passed 2026-02-10 and stands at 2026-02-16T17:30/
    )
  })

  it('refuses to run in a process that is not on the clock', async () => {
    rmSync(clockFile, { force: true })

    await assert.rejects(stackClock.moveTo('2026-02-16T17:30:00Z'), {
      message: /not on the simulated clock/
    })
    assert.ok(existsSync(clockFile), 'the stack was moved before the check')
  })
})
