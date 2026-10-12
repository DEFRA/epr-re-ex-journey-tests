import { test } from '@playwright/test'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import { currentYear } from '../support/date.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'

test.describe('Reports list @reportsList', () => {
  test('lists only this calendar year, which the early-year report skips rely on @reportsListCurrentYearOnly', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter' }
    ])
    const migrated = await updateMigratedOrganisation(
      org.refNo,
      [
        {
          regNumber: 'R26EX5000000007PA',
          accNumber: 'A26EX5000000007PA',
          status: 'approved'
        }
      ],
      undefined,
      `${currentYear() - 1}-01-01`
    )
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const response = await new BaseAPI().get(
      `/v1/organisations/${org.refNo}/registrations/${migrated.registrationIds[0]}/reports/calendar`,
      defraIdStub.authHeader(user.userId)
    )
    const { reportingPeriods } = /** @type {any} */ (await response.body.json())
    const otherYears = reportingPeriods
      .map((/** @type {{ startDate: string }} */ period) =>
        new Date(period.startDate).getUTCFullYear()
      )
      .filter((/** @type {number} */ year) => year !== currentYear())

    expect(response.statusCode).to.equal(200)
    expect(
      otherYears,
      'The reports list now spans more than this calendar year: remove the reportsLandingHasNoClosedPeriod skips and seed those specs with validFromWithClosedPeriod'
    ).to.deep.equal([])
  })
})
