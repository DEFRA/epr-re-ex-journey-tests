import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const preload = join(dirname(fileURLToPath(import.meta.url)), 'fake-clock.cjs')
const scratch = mkdtempSync(join(tmpdir(), 'fake-clock-'))
const clockFile = join(scratch, 'clock.txt')

// Read when the module loads, so the controls under test drive the scratch
// clock rather than the one the repository's own stack reads.
process.env.FAKE_CLOCK_FILE = clockFile
const { setSimulatedNow, clearSimulatedClock } =
  await import('./simulated-clock.js')

after(() => rmSync(scratch, { recursive: true, force: true }))

/** @param {string} script */
const runUnderClock = (script) =>
  execFileSync(process.execPath, ['--require', preload, '-e', script], {
    env: { ...process.env, FAKE_CLOCK_FILE: clockFile },
    encoding: 'utf8',
    // Captured rather than inherited, so the failure one test provokes on
    // purpose does not print a stack trace over a passing run.
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

describe('the simulated clock', () => {
  it('reports the instant it was set to as now', () => {
    setSimulatedNow('2026-02-16T09:30:00Z')

    const now = new Date(runUnderClock('console.log(new Date().toISOString())'))

    assert.equal(now.toISOString().slice(0, 16), '2026-02-16T09:30')
  })

  it('publishes an instant without leaving a half-written file behind', () => {
    setSimulatedNow('2026-02-16T09:30:00Z')

    assert.deepEqual(readdirSync(scratch), ['clock.txt'])
  })

  it('gives Date.now() whole milliseconds, which pino requires', () => {
    setSimulatedNow('2026-02-16T09:30:00Z')

    const now = runUnderClock('console.log(Date.now())')

    assert.ok(Number.isInteger(Number(now)), `${now} is not an integer`)
  })

  it('leaves a process on real time once the clock is cleared', () => {
    clearSimulatedClock()
    assert.ok(!existsSync(clockFile))

    const now = new Date(runUnderClock('console.log(new Date().toISOString())'))

    assert.ok(
      Math.abs(now.getTime() - Date.now()) < 60_000,
      `${now} is not now`
    )
  })

  it('jumps a running process to a new instant', async () => {
    setSimulatedNow('2026-02-16T09:30:00Z')
    const child = spawn(
      process.execPath,
      [
        '--require',
        preload,
        '-e',
        'setInterval(() => console.log(new Date().toISOString()), 50)'
      ],
      { env: { ...process.env, FAKE_CLOCK_FILE: clockFile } }
    )
    /** @type {string[]} */
    const dates = []
    child.stdout.on('data', (/** @type {Buffer} */ chunk) =>
      dates.push(...`${chunk}`.trim().split('\n'))
    )

    try {
      await delay(500)
      setSimulatedNow('2026-03-20T14:00:00Z')
      await delay(500)
    } finally {
      child.kill()
    }

    assert.ok(dates.length > 1, 'the child printed nothing')
    const [first] = dates
    const last = dates[dates.length - 1]
    assert.ok(first.startsWith('2026-02-16'), `started at ${first}`)
    assert.ok(last.startsWith('2026-03-20'), `ended at ${last}`)
    assert.ok(
      dates.every((d) => d.startsWith('2026-')),
      `a reader caught the jump mid-write: ${dates.find((d) => !d.startsWith('2026-'))}`
    )
  })

  it('refuses to simulate something that is not a date', () => {
    assert.throws(() => setSimulatedNow('the ides of March'), /not a date/)
  })

  it('stops a process whose clock file it cannot read', () => {
    writeFileSync(clockFile, 'the ides of March')

    let stderr
    try {
      runUnderClock('console.log(new Date().toISOString())')
      assert.fail('the process started on an unreadable clock file')
    } catch (failure) {
      stderr = `${failure.stderr}`
    }

    assert.match(stderr, /fake-clock: cannot parse "the ides of March"/)
  })
})
