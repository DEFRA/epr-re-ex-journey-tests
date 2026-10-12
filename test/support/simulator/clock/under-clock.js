import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const preload = join(dirname(fileURLToPath(import.meta.url)), 'fake-clock.mjs')

/**
 * @param {string} instant
 * @param {string} code
 * @returns {string} what the snippet printed, trimmed
 */
export const evaluateUnderClock = (instant, code) => {
  const scratch = mkdtempSync(join(tmpdir(), 'under-clock-'))
  const clockFile = join(scratch, 'clock.txt')
  writeFileSync(clockFile, instant)
  try {
    return execFileSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', code],
      {
        env: { ...process.env, FAKE_CLOCK_FILE: clockFile },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    ).trim()
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
