import {
  createLinkedOrganisation,
  getOrganisation,
  updateMigratedOrganisation,
  updateStatus
} from '~/test/support/seeding/organisation.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { test, expect } from '@playwright/test'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

test.describe('Reinstated accreditation @reinstatedaccreditation', () => {
  test('Reapproving a suspended accreditation and reinstating a cancelled one restore PERN access @reinstatedprn', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)

    const regNumber = 'E25SR500030915PA'
    const accNumber = 'ACC234570'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
    ])

    const orgId = organisationDetails.refNo
    const migrationResponse = await updateMigratedOrganisation(orgId, [
      {
        regNumber,
        accNumber,
        status: 'approved'
      }
    ])

    await updateStatus(orgId, 'suspended')

    await createLinkAndLogin(page, orgId, migrationResponse.email)

    let accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Suspended')

    // suspended -> approved: reapproving lifts the suspension
    await updateStatus(orgId, 'approved')
    await page.reload()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Approved')

    await dashboardPage.selectTableLink(1, 1)
    expect(
      (await page.locator('a', { hasText: 'Create new PERN' }).count()) > 0
    ).toBe(true)
    await dashboardPage.backLink().click()

    // approved -> suspended -> cancelled: cancellation is only reachable via
    // suspended, after which the operator is no longer accredited
    await updateStatus(orgId, 'suspended')
    await updateStatus(orgId, 'cancelled')
    await page.reload()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')

    // cancelled -> approved: reinstatement after a successful appeal,
    // effective on the day it is actioned
    await updateStatus(orgId, 'approved')
    await page.reload()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Approved')

    const orgData = await getOrganisation(orgId)
    expect(orgData.accreditations[0].status).toBe('approved')

    await dashboardPage.selectTableLink(1, 1)
    expect(
      (await page.locator('a', { hasText: 'Create new PERN' }).count()) > 0
    ).toBe(true)
  })
})
