import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { setSimulatedNow } from './simulated-clock.js'

const preload = join(dirname(fileURLToPath(import.meta.url)), 'fake-clock.cjs')
const scratch = mkdtempSync(join(tmpdir(), 'fake-clock-'))
const clockFile = join(scratch, 'clock.txt')

after(() => rmSync(scratch, { recursive: true, force: true }))

const runUnderClock = (script) =>
  execFileSync(process.execPath, ['--require', preload, '-e', script], {
    env: { ...process.env, FAKE_CLOCK_FILE: clockFile },
    encoding: 'utf8'
  }).trim()

describe('the fake clock preload', () => {
  it('reports the instant written in the clock file as now', () => {
    writeFileSync(clockFile, '2026-02-16T09:30:00.000Z')

    const now = new Date(runUnderClock('console.log(new Date().toISOString())'))

    assert.equal(now.toISOString().slice(0, 16), '2026-02-16T09:30')
  })

  it('gives Date.now() whole milliseconds, which pino requires', () => {
    writeFileSync(clockFile, '2026-02-16T09:30:00.000Z')

    const now = runUnderClock('console.log(Date.now())')

    assert.ok(Number.isInteger(Number(now)), `${now} is not an integer`)
  })

  it('leaves a process on real time when there is no clock file', () => {
    rmSync(clockFile, { force: true })

    const now = new Date(runUnderClock('console.log(new Date().toISOString())'))

    assert.ok(
      Math.abs(now.getTime() - Date.now()) < 60_000,
      `${now} is not now`
    )
  })

  it('jumps a running process to a rewritten instant', async () => {
    writeFileSync(clockFile, '2026-02-16T09:30:00.000Z')
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
    const dates = []
    child.stdout.on('data', (chunk) =>
      dates.push(...`${chunk}`.trim().split('\n'))
    )

    try {
      await delay(500)
      writeFileSync(clockFile, '2026-03-20T14:00:00.000Z')
      await delay(500)
    } finally {
      child.kill()
    }

    assert.ok(dates.at(0).startsWith('2026-02-16'), `started at ${dates.at(0)}`)
    assert.ok(dates.at(-1).startsWith('2026-03-20'), `ended at ${dates.at(-1)}`)
  })

  it('refuses to simulate something that is not a date', () => {
    assert.throws(() => setSimulatedNow('the ides of March'), /not a date/)
  })
})
