import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { planCalendar } from '../calendar/calendar.js'
import { EVENT } from '../calendar/events.js'
import { createRun, executeEvent } from '../execute/execute.js'
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import {
  appendJournal,
  entryFor,
  manifestOf,
  readJournal,
  readSettings,
  restore,
  writeManifest,
  writeSettings
} from './journal.js'
import { eventKey, eventsInOrder } from './runner.js'

/** @import {Seeders} from '../execute/seeders.js' */

const population = planPopulation({ seed: 'journal', scale: 0.02 })
const rows = planSummaryLogRows({ population })
const calendar = planCalendar({
  population,
  rows,
  from: '2026-01-01',
  to: '2026-04-30'
})
const events = eventsInOrder(calendar)

/**
 * Seeders that answer as the service would, with ids that say what they
 * were made for, so a restored run can be checked against what was made.
 *
 * @returns {Seeders}
 */
function fakeSeeders() {
  let organisations = 0
  let notes = 0
  const answer = (value) => () => Promise.resolve(value)
  return /** @type {Seeders} */ (
    /** @type {unknown} */ ({
      createLinkedOrganisation: () => {
        organisations += 1
        return Promise.resolve({
          refNo: `org-${organisations}`,
          orgId: 500000 + organisations
        })
      },
      approveMigratedRegistration: (refNo, { registrationIndex }) =>
        Promise.resolve({
          registrationId: `${refNo}-reg-${registrationIndex}`,
          accreditationId: `${refNo}-acc-${registrationIndex}`,
          email: `${refNo}@example.com`
        }),
      changeMigratedStatus: answer(undefined),
      seedOverseasSites: answer(undefined),
      createAndRegisterDefraIdUser: (email) =>
        Promise.resolve({ userId: `user-for-${email}` }),
      linkDefraIdUser: answer({ Authorization: 'Bearer linked' }),
      signInDefraIdUser: answer({ Authorization: 'Bearer signed-in' }),
      generateSummaryLogContent: answer({ meta: {}, data: {} }),
      submitSummaryLogContent: answer({
        summaryLogId: 'log',
        status: 'submitted',
        validation: {}
      }),
      seedReportSubmission: answer(undefined),
      waitForAvailableBalance: answer(undefined),
      createPrn: () => {
        notes += 1
        return Promise.resolve({ prnPath: `/notes/note-${notes}` })
      },
      updatePrnStatus: (prnPath, _auth, status) =>
        Promise.resolve({
          prnNumber:
            status === 'awaiting_acceptance' ? `N${prnPath}` : undefined
        }),
      externalAPIAcceptPrn: answer(undefined),
      externalAPICancelPrn: answer(undefined)
    })
  )
}

/** The first events that are not rejected uploads, which the fake seeders cannot answer as planned. */
const replayable = events.filter(
  (event) =>
    !(event.type === EVENT.SUMMARY_LOG_UPLOADED && event.outcome === 'rejected')
)

describe('the run directory', () => {
  let directory = ''
  before(() => {
    directory = mkdtempSync(join(tmpdir(), 'simulator-run-'))
  })
  after(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('holds no settings until a run is planned there', () => {
    assert.equal(readSettings(directory), null)
    const settings = {
      seed: 'journal',
      scale: 0.02,
      profileMix: 'production',
      from: '2026-01-01',
      to: '2026-04-30',
      calibration: 'abc123'
    }
    writeSettings(directory, settings)
    assert.deepEqual(readSettings(directory), settings)
  })

  it('journals each event, and restores a run that holds what the first one made', async () => {
    const first = createRun({ population, rows, seeders: fakeSeeders() })
    const executed = replayable.slice(0, 40)
    for (const event of executed) {
      await executeEvent(first, event)
      appendJournal(directory, entryFor(first, event))
    }
    assert.ok(
      executed.some((event) => 'prnId' in event),
      'the events replayed include a note'
    )

    const second = createRun({ population, rows, seeders: fakeSeeders() })
    const done = restore(second, readJournal(directory), events)

    assert.deepEqual([...done], executed.map(eventKey))
    assert.deepEqual([...second.operators.keys()], [...first.operators.keys()])
    for (const [id, operator] of first.operators) {
      const restored = second.operators.get(id)
      assert.ok(restored)
      assert.equal(restored.refNo, operator.refNo)
      assert.equal(restored.orgId, operator.orgId)
      assert.deepEqual(restored.user, operator.user)
      assert.equal(restored.email, operator.email)
      assert.equal(restored.signedInAt, -Infinity)
      assert.deepEqual(
        [...restored.registrations.keys()],
        [...operator.registrations.keys()]
      )
      for (const [registrationId, registration] of operator.registrations) {
        const {
          uploads,
          notes,
          planned,
          rows: plannedRows,
          ...ids
        } = registration
        const restoredRegistration = restored.registrations.get(registrationId)
        assert.ok(restoredRegistration)
        const {
          uploads: restoredUploads,
          notes: restoredNotes,
          planned: restoredPlanned,
          rows: restoredRows,
          ...restoredIds
        } = restoredRegistration
        assert.deepEqual(restoredIds, ids)
        assert.equal(restoredPlanned, planned)
        assert.equal(restoredRows, plannedRows)
        assert.deepEqual(restoredUploads, uploads)
        assert.deepEqual([...restoredNotes], [...notes])
      }
    }
  })

  it('carries on from a restored run as the first would have', async () => {
    const second = createRun({ population, rows, seeders: fakeSeeders() })
    const done = restore(second, readJournal(directory), events)
    const next = replayable.find((event) => !done.has(eventKey(event)))
    assert.ok(next)
    await executeEvent(second, next)
    appendJournal(directory, entryFor(second, next))
    assert.equal(readJournal(directory).length, done.size + 1)
  })

  it('writes a manifest naming every organisation and how to sign in', () => {
    const run = createRun({ population, rows, seeders: fakeSeeders() })
    const done = restore(run, readJournal(directory), events)
    const settings = readSettings(directory)
    assert.ok(settings)
    const manifest = manifestOf({
      run,
      settings,
      defraIdStub: 'http://localhost:3200',
      events: { done: done.size, total: events.length }
    })
    const path = writeManifest(directory, manifest)
    const written = JSON.parse(readFileSync(path, 'utf8'))

    assert.equal(written.seed, 'journal')
    assert.equal(written.complete, false)
    assert.equal(written.defraIdStub, 'http://localhost:3200')
    assert.equal(written.operators.length, run.operators.size)
    for (const operator of written.operators) {
      const live = run.operators.get(operator.id)
      assert.ok(live)
      assert.deepEqual(operator.signIn, {
        email: live.email,
        userId: live.user?.userId
      })
      assert.equal(operator.registrations.length, live.registrations.size)
      for (const registration of operator.registrations) {
        assert.match(registration.regNumber, /^R26/)
      }
    }
  })
  it('drops a torn last line, so a run killed mid-write does that event again', () => {
    const whole = readJournal(directory)
    writeFileSync(join(directory, 'journal.jsonl'), '{"key":"torn', {
      flag: 'a'
    })
    assert.deepEqual(readJournal(directory), whole)
    appendJournal(directory, { key: 'after' })
    assert.deepEqual(readJournal(directory), [...whole, { key: 'after' }])
  })

  it('terminates a whole last line left without its newline, so the next entry starts its own', () => {
    const whole = readJournal(directory)
    writeFileSync(join(directory, 'journal.jsonl'), '{"key":"unterminated"}', {
      flag: 'a'
    })
    assert.deepEqual(readJournal(directory), [
      ...whole,
      { key: 'unterminated' }
    ])
    appendJournal(directory, { key: 'next' })
    assert.deepEqual(readJournal(directory), [
      ...whole,
      { key: 'unterminated' },
      { key: 'next' }
    ])
  })

  it('refuses a torn line anywhere else', () => {
    writeFileSync(join(directory, 'journal.jsonl'), '{"key":"torn\n', {
      flag: 'a'
    })
    appendJournal(directory, { key: 'later' })
    assert.throws(
      () => readJournal(directory),
      /line \d+ is not a journal entry/
    )
  })

  it('refuses a journal written from another plan', () => {
    const run = createRun({ population, rows, seeders: fakeSeeders() })
    const key = 'OP-9999-R1 registration.approved 2026-01-01T09:00:00.000Z'
    assert.throws(
      () => restore(run, [{ key }], events),
      /journal was written from a different plan/
    )
  })
})

describe('entryFor', () => {
  it('refuses an event the run holds nothing for', () => {
    const run = createRun({ population, rows, seeders: fakeSeeders() })
    assert.throws(
      () => entryFor(run, events[0]),
      /executed against nothing the run holds/
    )
  })
})
