/**
 * Replays a planned calendar against the service: moves the clock to each
 * simulated day and hands that day's events to the executors, operators side
 * by side and each operator's own events in order.
 *
 * The clock moves once per day, to the last instant anything happens that
 * day, and only while nothing is in flight. A Defra ID token lasts an hour of
 * simulated time and the executors renew one only as an event starts, so a
 * jump under an event mid-flight would leave its later calls unauthorised.
 * Holding the clock still while events run is what lets them overlap.
 */

import { setSimulatedNow } from '../clock/simulated-clock.js'
import { executeEvent } from '../execute/execute.js'

/** @import {CalendarEvent} from '../calendar/events.js' */
/** @import {PlannedCalendar} from '../calendar/calendar.js' */
/** @import {Run} from '../execute/execute.js' */

/** How long every process on the clock takes to notice a jump. */
const CLOCK_SETTLE_MS = 500

/**
 * What tells the events of a run apart. No two events of one registration
 * share an instant, so this is unique across the calendar.
 *
 * @param {CalendarEvent} event
 */
export const eventKey = (event) =>
  `${event.registrationId} ${event.type} ${event.at}`

/** @param {CalendarEvent} event */
const dayOf = (event) => event.at.slice(0, 10)

/**
 * Every event of every operator, in the order they happen.
 *
 * @param {PlannedCalendar} calendar
 * @returns {CalendarEvent[]}
 */
export function eventsInOrder(calendar) {
  return calendar.operators
    .flatMap((operator) => operator.events)
    .sort(
      (a, b) =>
        a.at.localeCompare(b.at) ||
        a.registrationId.localeCompare(b.registrationId)
    )
}

/**
 * @typedef {Object} Clock
 * @property {(instant: string) => Promise<void>} moveTo - moves the stack to an instant and resolves once it has noticed
 */

/** @type {Clock} */
export const stackClock = {
  async moveTo(instant) {
    setSimulatedNow(instant)
    await new Promise((resolve) => setTimeout(resolve, CLOCK_SETTLE_MS))
  }
}

/**
 * A request to stop dispatching. Events already under way finish, so the
 * journal records everything the service was asked to do.
 *
 * @typedef {Object} Stop
 * @property {() => boolean} requested
 * @property {(reason: string) => void} request
 * @property {() => string | null} reason
 */

/** @returns {Stop} */
export function createStop() {
  /** @type {string | null} */
  let reason = null
  return {
    requested: () => reason !== null,
    request: (why) => {
      reason ??= why
    },
    reason: () => reason
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} by
 * @returns {T[][]} - the groups, in order of first appearance, each in the items' order
 */
function groupInOrder(items, by) {
  /** @type {Map<string, T[]>} */
  const groups = new Map()
  for (const item of items) {
    const key = by(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return [...groups.values()]
}

/**
 * Runs `work` over the queues, at most `concurrency` at a time. A queue that
 * throws asks the rest to stop; every queue under way finishes its current
 * item, and the first error is what comes back.
 *
 * @template T
 * @param {T[]} queues
 * @param {number} concurrency
 * @param {(queue: T) => Promise<void>} work
 * @param {Stop} stop
 */
async function drain(queues, concurrency, work, stop) {
  const pending = [...queues]
  const workers = Array.from({ length: concurrency }, async () => {
    while (pending.length > 0 && !stop.requested()) {
      const queue = pending.shift()
      if (queue !== undefined) await work(queue)
    }
  })
  const outcomes = await Promise.allSettled(workers)
  const failed = outcomes.find((outcome) => outcome.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

/**
 * Replays the events not yet done, day by day. Resolves once every event
 * is done or a stop was requested; what stopped it is on `stop`.
 *
 * @param {Object} options
 * @param {Run} options.run
 * @param {CalendarEvent[]} options.events - in the order they happen
 * @param {Set<string>} options.done - keys of the events already executed
 * @param {number} options.concurrency - how many operators act at once
 * @param {(event: CalendarEvent) => Promise<void> | void} options.onExecuted - called after each event, before the next of that operator
 * @param {Stop} options.stop
 * @param {Clock} [options.clock]
 * @param {(run: Run, event: CalendarEvent) => Promise<unknown>} [options.execute]
 */
export async function replay({
  run,
  events,
  done,
  concurrency,
  onExecuted,
  stop,
  clock = stackClock,
  execute = executeEvent
}) {
  // The day's last instant comes from the whole plan, so a run resumed part
  // way through a day moves the clock to where it already stood rather than
  // back to the last event still to do.
  /** @type {Map<string, string>} */
  const lastInstantOfDay = new Map()
  for (const event of events) {
    lastInstantOfDay.set(dayOf(event), event.at)
  }
  const remaining = events.filter((event) => !done.has(eventKey(event)))
  const days = groupInOrder(remaining, dayOf)

  for (const day of days) {
    if (stop.requested()) return
    await clock.moveTo(lastInstantOfDay.get(dayOf(day[0])) ?? day[0].at)
    const operators = groupInOrder(day, (event) => event.organisationId)
    await drain(
      operators,
      concurrency,
      async (queue) => {
        for (const event of queue) {
          if (stop.requested()) return
          try {
            await execute(run, event)
          } catch (error) {
            stop.request(`${eventKey(event)} failed`)
            throw error
          }
          await onExecuted(event)
        }
      },
      stop
    )
  }
}
