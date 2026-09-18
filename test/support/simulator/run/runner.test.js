import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { planCalendar } from '../calendar/calendar.js'
import { createRun } from '../execute/execute.js'
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import { createStop, eventKey, eventsInOrder, replay } from './runner.js'

/** @import {CalendarEvent} from '../calendar/events.js' */
/** @import {Run} from '../execute/execute.js' */
/** @import {Clock} from './runner.js' */

const population = planPopulation({ seed: 'runner', scale: 0.02 })
const rows = planSummaryLogRows({ population })
const calendar = planCalendar({
  population,
  rows,
  from: '2026-01-01',
  to: '2026-03-31'
})
const events = eventsInOrder(calendar)

/** A run the fake executor never reads. */
const run = createRun({ population, rows })

/**
 * An executor that records the order it was handed events in, and where
 * the clock stood for each, while holding each one open until released so
 * a test can see what runs together.
 */
function recordingExecutor() {
  /** @type {string[]} */
  const executed = []
  /** @type {string[]} */
  const clockMoves = []
  /** @type {Map<string, string>} */
  const clockAt = new Map()
  /** @type {Set<string>} */
  const inFlight = new Set()
  let widest = 0
  /** @type {Map<string, () => void>} */
  const held = new Map()
  let now = ''
  return {
    executed,
    clockMoves,
    clockAt,
    widest: () => widest,
    inFlight: () => [...inFlight],
    /** @type {Clock} */
    clock: {
      moveTo: async (instant) => {
        assert.equal(
          inFlight.size,
          0,
          `clock moved to ${instant} under ${[...inFlight]}`
        )
        clockMoves.push(instant)
        now = instant
      }
    },
    /** @type {(run: Run, event: CalendarEvent) => Promise<void>} */
    execute: (_run, event) => {
      const key = eventKey(event)
      inFlight.add(key)
      widest = Math.max(widest, inFlight.size)
      clockAt.set(key, now)
      return new Promise((resolve) => {
        held.set(key, () => {
          inFlight.delete(key)
          executed.push(key)
          resolve()
        })
      })
    },
    /**
     * Lets each event finish as it is dispatched, until the replay settles.
     *
     * @param {Promise<void>} replaying
     */
    async releaseUntilSettled(replaying) {
      const settled = { is: false }
      const settle = () => {
        settled.is = true
      }
      replaying.then(settle, settle)
      while (!settled.is) {
        await new Promise((resolve) => setImmediate(resolve))
        const releases = [...held.values()]
        held.clear()
        for (const release of releases) release()
      }
    }
  }
}

describe('eventsInOrder', () => {
  it('lists every event of every operator in the order they happen', () => {
    const count = calendar.operators.reduce(
      (total, operator) => total + operator.events.length,
      0
    )
    assert.equal(events.length, count)
    for (let index = 1; index < events.length; index += 1) {
      assert.ok(events[index - 1].at <= events[index].at)
    }
  })
})

describe('eventKey', () => {
  it('tells every event of the plan apart', () => {
    assert.equal(new Set(events.map(eventKey)).size, events.length)
  })
})

describe('replay', () => {
  it('moves the clock once per day, to the last instant of that day, with nothing in flight', async () => {
    const recorder = recordingExecutor()
    const replaying = replay({
      run,
      events,
      done: new Set(),
      concurrency: 8,
      onExecuted: () => {},
      stop: createStop(),
      ...recorder
    })
    await recorder.releaseUntilSettled(replaying)
    await replaying

    const lastInstantOfDay = new Map()
    for (const planned of events) {
      lastInstantOfDay.set(planned.at.slice(0, 10), planned.at)
    }
    assert.deepEqual(recorder.clockMoves, [...lastInstantOfDay.values()])
    for (const planned of events) {
      assert.equal(
        recorder.clockAt.get(eventKey(planned)),
        lastInstantOfDay.get(planned.at.slice(0, 10))
      )
    }
  })

  it('runs operators side by side and each operator in order, up to the concurrency', async () => {
    const sameDay = events.filter((e) => e.at.startsWith('2026-01-05'))
    const operators = new Set(sameDay.map((e) => e.organisationId))
    assert.ok(operators.size >= 3, 'three operators act that day')
    assert.ok(
      sameDay.filter((e) => e.organisationId === 'OP-0001').length > 1,
      'one of them acts more than once'
    )
    const recorder = recordingExecutor()
    /** @type {string[]} */
    const executedInOrder = []
    const replaying = replay({
      run,
      events: sameDay,
      done: new Set(),
      concurrency: 2,
      onExecuted: (executed) => {
        executedInOrder.push(eventKey(executed))
      },
      stop: createStop(),
      ...recorder
    })
    await recorder.releaseUntilSettled(replaying)
    await replaying

    assert.equal(recorder.widest(), 2)
    const ofA = executedInOrder.filter((key) => key.startsWith('OP-0001-'))
    assert.deepEqual(
      ofA,
      sameDay.filter((e) => e.organisationId === 'OP-0001').map(eventKey)
    )
    assert.equal(executedInOrder.length, sameDay.length)
  })

  it('skips the events already done', async () => {
    const recorder = recordingExecutor()
    const done = new Set(events.slice(0, 5).map(eventKey))
    const replaying = replay({
      run,
      events,
      done,
      concurrency: 4,
      onExecuted: () => {},
      stop: createStop(),
      ...recorder
    })
    await recorder.releaseUntilSettled(replaying)
    await replaying
    assert.equal(recorder.executed.length, events.length - 5)
    for (const key of done) assert.ok(!recorder.executed.includes(key))
  })

  it('moves a resumed day to its last planned instant, not its last event still to do', async () => {
    const recorder = recordingExecutor()
    const firstDay = events[0].at.slice(0, 10)
    const ofFirstDay = events.filter((e) => e.at.startsWith(firstDay))
    const lastOfDay = ofFirstDay[ofFirstDay.length - 1]
    assert.ok(ofFirstDay.length > 1)
    const replaying = replay({
      run,
      events,
      done: new Set([eventKey(lastOfDay)]),
      concurrency: 4,
      onExecuted: () => {},
      stop: createStop(),
      ...recorder
    })
    await recorder.releaseUntilSettled(replaying)
    await replaying
    assert.equal(recorder.clockMoves[0], lastOfDay.at)
  })

  it('stops when journalling an event fails, and throws that error', async () => {
    const recorder = recordingExecutor()
    const stop = createStop()
    const failing = eventKey(events[1])
    const replaying = replay({
      run,
      events,
      done: new Set(),
      concurrency: 4,
      onExecuted: (executed) => {
        if (eventKey(executed) === failing) throw new Error('disk full')
      },
      stop,
      ...recorder
    })
    await recorder.releaseUntilSettled(replaying)
    await assert.rejects(replaying, { message: 'disk full' })
    assert.equal(stop.reason(), `${failing} failed`)
    assert.ok(recorder.executed.length < events.length)
  })

  it('stops dispatching once asked, letting what is under way finish', async () => {
    const recorder = recordingExecutor()
    const stop = createStop()
    const journal = []
    const replaying = replay({
      run,
      events,
      done: new Set(),
      concurrency: 3,
      onExecuted: (executed) => {
        journal.push(eventKey(executed))
      },
      stop,
      ...recorder
    })
    await new Promise((resolve) => setImmediate(resolve))
    const underWay = recorder.inFlight()
    assert.equal(underWay.length, 3)
    stop.request('interrupted')
    await recorder.releaseUntilSettled(replaying)
    await replaying

    assert.deepEqual(recorder.executed, underWay)
    assert.deepEqual(journal, recorder.executed)
    assert.equal(stop.reason(), 'interrupted')
  })

  it('stops on a failed event, finishes the rest under way, and throws that error', async () => {
    const recorder = recordingExecutor()
    const stop = createStop()
    const failing = eventKey(events[1])
    /** @type {(run: Run, event: CalendarEvent) => Promise<void>} */
    const execute = (aRun, planned) =>
      eventKey(planned) === failing
        ? Promise.reject(new Error('the service refused it'))
        : recorder.execute(aRun, planned)
    const replaying = replay({
      run,
      events,
      done: new Set(),
      concurrency: 4,
      onExecuted: () => {},
      stop,
      clock: recorder.clock,
      execute
    })
    await recorder.releaseUntilSettled(replaying)
    await assert.rejects(replaying, { message: 'the service refused it' })
    assert.equal(stop.reason(), `${failing} failed`)
    assert.ok(recorder.executed.length < events.length)
  })
})
