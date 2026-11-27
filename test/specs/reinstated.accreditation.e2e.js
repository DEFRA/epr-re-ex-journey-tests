import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  updateStatus
} from '~/test/support/seeding/organisation.js'
import { accreditationStatus } from '~/test/support/seeding/natural-key-paths.js'
import { currentYear } from '~/test/support/date.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { test, expect } from '@playwright/test'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { generateNumbers } from '~/test/support/reg-acc-number.js'

test.describe('Reinstated accreditation @reinstatedAccreditation', () => {
  test('Reapproving a suspended accreditation and reinstating a cancelled one restore PERN access @reinstatedPRN', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)

    const { regNumber, accNumber } = generateNumbers({
      wasteProcessingType: 'exporter',
      materialSuffix: 'AL'
    })

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

    await updateStatus(orgId, 'suspended', { regNumber, accNumber })

    await createLinkAndLogin(page, orgId, migrationResponse.email)

    let accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Suspended')

    // suspended -> approved: reapproving lifts the suspension
    await updateStatus(orgId, 'approved', { regNumber, accNumber })
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
    await updateStatus(orgId, 'suspended', { regNumber, accNumber })
    await updateStatus(orgId, 'cancelled', { regNumber, accNumber })
    await page.reload()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')

    // cancelled -> approved: reinstatement after a successful appeal
    await updateStatus(orgId, 'approved', { regNumber, accNumber })
    await page.reload()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Approved')

    expect(
      await accreditationStatus(
        orgId,
        migrationResponse.registrationIds[0],
        currentYear()
      )
    ).toBe('approved')

    await dashboardPage.selectTableLink(1, 1)
    expect(
      (await page.locator('a', { hasText: 'Create new PERN' }).count()) > 0
    ).toBe(true)
  })
})
