/**
 * What a run leaves on disk, in its run directory: the settings it was
 * planned from, a journal of every event executed with the ids the service
 * gave, and the manifest of the organisations it made. The journal is what a
 * resumed run rebuilds its state from, so it skips what already exists.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import { EVENT } from '../calendar/events.js'
import { eventKey } from './runner.js'

/** @import {CalendarEvent} from '../calendar/events.js' */
/** @import {Run, LiveOperator, LiveRegistration} from '../execute/execute.js' */

/**
 * @typedef {Object} RunSettings - what the plan is built from; a resumed run has to match
 * @property {string} seed
 * @property {number} scale
 * @property {string} profileMix
 * @property {string} from - ISO date
 * @property {string} to - ISO date
 */

/**
 * @typedef {Object} JournalEntry - one executed event and what the service gave for it
 * @property {string} key
 * @property {OperatorRecord} [operator] - on an approval: the operator as the service now holds it
 * @property {RegistrationRecord} [registration] - on an approval: likewise the registration
 * @property {NoteRecord} [note] - on a PRN event: the note as it now stands
 */

/**
 * @typedef {Object} OperatorRecord
 * @property {string} id - the planned id
 * @property {string} refNo
 * @property {number} orgId
 * @property {string} userId - the Defra ID user linked to it
 * @property {string} email
 */

/**
 * @typedef {Object} RegistrationRecord
 * @property {string} id - the planned id
 * @property {string} registrationId
 * @property {string | null} accreditationId
 * @property {string} regNumber
 * @property {string | null} accNumber
 * @property {number} index
 * @property {number | null} accreditationIndex
 */

/**
 * @typedef {Object} NoteRecord
 * @property {string} registration - the planned registration id
 * @property {string} prnId - the plan's id
 * @property {string} prnPath
 * @property {string | null} prnNumber
 */

const SETTINGS = 'settings.json'
const JOURNAL = 'journal.jsonl'
const MANIFEST = 'manifest.json'

/**
 * @param {string} directory
 * @returns {RunSettings | null} - the settings a run in this directory was planned from, if one was
 */
export function readSettings(directory) {
  const path = join(directory, SETTINGS)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

/**
 * @param {string} directory
 * @param {RunSettings} settings
 */
export function writeSettings(directory, settings) {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, SETTINGS), JSON.stringify(settings, null, 2))
}

/**
 * Every entry journalled so far. A run killed outright mid-write leaves a
 * torn last line, which is dropped, so its event is done again on resume. A
 * torn line anywhere else is a journal nothing here wrote, and stops the run.
 *
 * @param {string} directory
 * @returns {JournalEntry[]}
 */
export function readJournal(directory) {
  const path = join(directory, JOURNAL)
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  return lines.flatMap((line, index) => {
    try {
      return [JSON.parse(line)]
    } catch (cause) {
      if (index === lines.length - 1) return []
      throw new Error(`${path} line ${index + 1} is not a journal entry`, {
        cause
      })
    }
  })
}

/**
 * @param {string} directory
 * @param {JournalEntry} entry
 */
export function appendJournal(directory, entry) {
  appendFileSync(join(directory, JOURNAL), `${JSON.stringify(entry)}\n`)
}

/**
 * The entry to journal once an event is executed: what the service now holds
 * that a later event, or a resumed run, needs.
 *
 * @param {Run} run
 * @param {CalendarEvent} event
 * @returns {JournalEntry}
 */
export function entryFor(run, event) {
  const operator = run.operators.get(event.organisationId)
  const registration = operator?.registrations.get(event.registrationId)
  if (!operator || !registration) {
    throw new Error(`${eventKey(event)} executed against nothing the run holds`)
  }
  /** @type {JournalEntry} */
  const entry = { key: eventKey(event) }

  if (event.type === EVENT.REGISTRATION_APPROVED) {
    if (!operator.user) {
      throw new Error(`${operator.planned.id} was approved with no user linked`)
    }
    entry.operator = {
      id: operator.planned.id,
      refNo: operator.refNo,
      orgId: operator.orgId,
      userId: operator.user.userId,
      email: operator.email
    }
    entry.registration = {
      id: registration.planned.id,
      registrationId: registration.registrationId,
      accreditationId: registration.accreditationId,
      regNumber: registration.regNumber,
      accNumber: registration.accNumber ?? null,
      index: registration.index,
      accreditationIndex: registration.accreditationIndex ?? null
    }
  }

  if ('prnId' in event) {
    const note = registration.notes.get(event.prnId)
    if (!note) {
      throw new Error(`${event.prnId} executed but the run holds no note`)
    }
    entry.note = {
      registration: registration.planned.id,
      prnId: event.prnId,
      ...note
    }
  }

  return entry
}

/**
 * Rebuilds the run's live state from the journal, so that it holds every
 * operator, registration and note a previous run made, and each
 * registration's uploads so far in the order the plan makes them.
 *
 * @param {Run} run - fresh, with nothing live yet
 * @param {JournalEntry[]} entries
 * @param {CalendarEvent[]} events - the whole plan, in order
 * @returns {Set<string>} the keys of the events already done
 */
export function restore(run, entries, events) {
  const done = new Set()
  for (const entry of entries) {
    done.add(entry.key)
    if (entry.operator) restoreOperator(run, entry.operator)
    if (entry.registration) restoreRegistration(run, entry.registration)
    if (entry.note) {
      const { registration, prnId, prnPath, prnNumber } = entry.note
      liveRegistrationOf(run, registration).notes.set(prnId, {
        prnPath,
        prnNumber
      })
    }
  }
  for (const event of events) {
    if (
      event.type === EVENT.SUMMARY_LOG_UPLOADED &&
      done.has(eventKey(event))
    ) {
      const operator = run.operators.get(event.organisationId)
      operator?.registrations.get(event.registrationId)?.uploads.push(event)
    }
  }
  return done
}

/**
 * @param {Run} run
 * @param {OperatorRecord} record
 */
function restoreOperator(run, { id, refNo, orgId, userId, email }) {
  if (run.operators.has(id)) return
  const planned = [...run.planned.values()].find(
    ({ operator }) => operator.id === id
  )?.operator
  if (!planned) throw new Error(`${id} is not a planned operator`)
  run.operators.set(id, {
    planned,
    refNo,
    orgId,
    user: { userId },
    email,
    authHeader: {},
    signedInAt: -Infinity,
    registrations: new Map()
  })
}

/**
 * @param {Run} run
 * @param {RegistrationRecord} record
 */
function restoreRegistration(run, record) {
  const planned = run.planned.get(record.id)
  if (!planned) throw new Error(`${record.id} is not a planned registration`)
  const operator = run.operators.get(planned.operator.id)
  if (!operator) {
    throw new Error(`${record.id} was journalled before its operator`)
  }
  operator.registrations.set(record.id, {
    planned: planned.registration,
    rows: planned.rows,
    index: record.index,
    accreditationIndex: record.accreditationIndex ?? undefined,
    registrationId: record.registrationId,
    accreditationId: record.accreditationId,
    regNumber: record.regNumber,
    accNumber: record.accNumber ?? undefined,
    uploads: [],
    notes: new Map()
  })
}

/**
 * @param {Run} run
 * @param {string} registrationId - the planned id
 * @returns {LiveRegistration}
 */
function liveRegistrationOf(run, registrationId) {
  const planned = run.planned.get(registrationId)
  const registration = run.operators
    .get(planned?.operator.id ?? '')
    ?.registrations.get(registrationId)
  if (!registration) {
    throw new Error(
      `${registrationId} has a note journalled before its approval`
    )
  }
  return registration
}

/**
 * The manifest of what a run made: every organisation, under the ids and
 * numbers the service gave it, and the Defra ID user to sign in as through
 * the stub.
 *
 * @param {Object} options
 * @param {Run} options.run
 * @param {RunSettings} options.settings
 * @param {string} options.defraIdStub - the stub's URL
 * @param {{done: number, total: number}} options.events
 */
export function manifestOf({ run, settings, defraIdStub, events }) {
  return {
    ...settings,
    events,
    complete: events.done === events.total,
    defraIdStub,
    operators: [...run.operators.values()].map(operatorEntry)
  }
}

/** @param {LiveOperator} operator */
function operatorEntry({ planned, refNo, orgId, user, email, registrations }) {
  return {
    id: planned.id,
    agency: planned.agency,
    nation: planned.nation,
    refNo,
    orgId,
    signIn: { email, userId: user?.userId ?? null },
    registrations: [...registrations.values()].map(registrationEntry)
  }
}

/** @param {LiveRegistration} registration */
function registrationEntry({
  planned,
  rows,
  registrationId,
  accreditationId,
  regNumber,
  accNumber
}) {
  return {
    id: planned.id,
    processingType: planned.processingType,
    stream: rows.stream,
    material: planned.material.suffix,
    registrationId,
    accreditationId,
    regNumber,
    accNumber: accNumber ?? null
  }
}

/**
 * @param {string} directory
 * @param {ReturnType<typeof manifestOf>} manifest
 * @returns {string} where it was written
 */
export function writeManifest(directory, manifest) {
  const path = join(directory, MANIFEST)
  writeFileSync(path, JSON.stringify(manifest, null, 2))
  return path
}
