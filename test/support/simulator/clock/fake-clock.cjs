// Preload with `node --require fake-clock.cjs` (or NODE_OPTIONS). Replaces the
// global Date so the process believes the instant written in FAKE_CLOCK_FILE
// was "now" at the moment that file was written. Time keeps flowing at the real
// rate from there, and every process sharing the file computes the same offset
// whenever it started, so a container that came up an hour ago and one that
// came up a second ago agree. Rewriting the file jumps the clock without a
// restart. An empty or missing file means real time.
'use strict'
const fs = require('node:fs')

const clockFile = process.env.FAKE_CLOCK_FILE
if (!clockFile) {
  throw new Error('fake-clock: FAKE_CLOCK_FILE is not set')
}

const RealDate = Date
const RECHECK_MS = 250

let offsetMs = 0
let lastMtimeMs = -1
let lastCheckedAt = 0

const readOffset = () => {
  let fd
  try {
    // The mtime and the contents have to come from one open file. The writer
    // renames a new file over this one, so a stat and a read taken separately
    // can straddle a jump and pair one instant with the other's mtime.
    fd = fs.openSync(clockFile, 'r')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    offsetMs = 0
    lastMtimeMs = -1
    return
  }

  try {
    const { mtimeMs } = fs.fstatSync(fd)
    if (mtimeMs === lastMtimeMs) return
    lastMtimeMs = mtimeMs
    const text = fs.readFileSync(fd, 'utf8').trim()
    if (!text) {
      offsetMs = 0
      return
    }
    const target = RealDate.parse(text)
    if (Number.isNaN(target)) {
      throw new Error(`fake-clock: cannot parse "${text}" in ${clockFile}`)
    }
    // pino converts Date.now() with BigInt at load, which throws on a
    // fractional value, so the offset has to be whole milliseconds.
    offsetMs = Math.round(target - mtimeMs)
  } finally {
    fs.closeSync(fd)
  }
}

const fakeNow = () => {
  const real = RealDate.now()
  if (real - lastCheckedAt > RECHECK_MS) {
    lastCheckedAt = real
    readOffset()
  }
  return real + offsetMs
}

class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fakeNow())
    } else {
      super(...args)
    }
  }

  static now() {
    return fakeNow()
  }
}

Object.defineProperty(FakeDate, 'name', { value: 'Date' })
globalThis.Date = FakeDate
readOffset()
