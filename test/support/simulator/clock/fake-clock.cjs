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
let loading = true

/** @param {string} message */
const fail = (message) => {
  if (loading) throw new Error(message)
  // Past load, a throw would surface from inside whichever Date.now() happened
  // to read it, and the process would carry on stamping the instant before the
  // one it cannot read. Leaving is the only way an operator sees this.
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

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
    const text = fs.readFileSync(fd, 'utf8').trim()
    if (!text) {
      lastMtimeMs = mtimeMs
      offsetMs = 0
      return
    }
    const target = RealDate.parse(text)
    if (Number.isNaN(target)) {
      fail(`fake-clock: cannot parse "${text}" in ${clockFile}`)
      return
    }
    lastMtimeMs = mtimeMs
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

// Proxied rather than subclassed, so Date.prototype stays the real one: a date
// that arrives from a worker thread or a structuredClone still satisfies
// instanceof, and Date() without new still answers with a string.
globalThis.Date = new Proxy(RealDate, {
  construct: (target, args, newTarget) =>
    Reflect.construct(target, args.length ? args : [fakeNow()], newTarget),
  apply: () => new RealDate(fakeNow()).toString(),
  get: (target, property, receiver) =>
    property === 'now' ? fakeNow : Reflect.get(target, property, receiver)
})

readOffset()
loading = false
