// Registration and accreditation numbers typed into an admin grant form.
//
// A grant goes through the status-history route, which is the only place that
// rejects a number another organisation already holds — there is no unique
// index behind it. Every spec in a run shares one database, so a granted
// number must be free against every other number in the suite. When it is not,
// the grant fails, the admin error page renders, and the spec times out on a
// missing element that says nothing about why.
//
// Seeding writes the number straight into the document, never reaches that
// check, and so is free to repeat. Seeded numbers are hand-picked, and every
// one of them sits in the 5000-prefixed band. Granted numbers use the
// 999-prefixed band below, which no hand-picked seed can reach.
//
// Grant a new number by adding a value here, not by typing a literal into a
// spec, so the whole granted set stays visible in one place.

export const REGISTRATION_TRANSITIONS_REG_NUMBER = 'E25SR999000001PA'
export const ACCREDITATION_TRANSITIONS_REG_NUMBER = 'E25SR999000002PA'
export const ACCREDITATION_TRANSITIONS_ACC_NUMBER = 'ACC999001'

const grantedNumbers = [
  REGISTRATION_TRANSITIONS_REG_NUMBER,
  ACCREDITATION_TRANSITIONS_REG_NUMBER,
  ACCREDITATION_TRANSITIONS_ACC_NUMBER
]

if (new Set(grantedNumbers).size !== grantedNumbers.length) {
  throw new Error(
    `Every granted number must be distinct, or the second grant of a run fails: ${grantedNumbers.join(', ')}`
  )
}
