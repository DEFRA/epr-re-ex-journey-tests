import { randomInt } from 'node:crypto'

// Registration and accreditation numbers to type into an admin grant form.
//
// Granting goes through the status-history route, the only place that rejects
// a number another organisation already holds. Seeding writes the number
// straight into the document, never reaches that check, and so is free to
// repeat. An issued number is not: it has to be free against every number the
// run seeds, and against every number an earlier run issued, because an issued
// number outlives its run wherever the database is not torn down afterwards.
//
// So issued numbers are generated rather than picked, in a band that no
// hand-picked number in the suite uses.

const REGISTRATION_BAND = 'E25SR9'
const ACCREDITATION_BAND = 'ACC9'
const BODY_DIGITS = 8

function body() {
  return String(randomInt(10 ** BODY_DIGITS)).padStart(BODY_DIGITS, '0')
}

export function issuedRegistrationNumber() {
  return `${REGISTRATION_BAND}${body()}PA`
}

export function issuedAccreditationNumber() {
  return `${ACCREDITATION_BAND}${body()}`
}
