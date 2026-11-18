import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  updateStatus
} from '~/test/support/seeding/organisation.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import { test, expect } from '@playwright/test'
import { checkBodyText } from '~/test/support/checks.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { generateNumbers } from '~/test/support/reg-acc-number.js'

test.describe('Cancelled accreditation @cancelledAccreditation', () => {
  test('Should not be able to access PERNs when an accreditation is cancelled @cancelledPRN', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const prnDashboardPage = new PRNDashboardPage(page)

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

    await updateStatus(orgId, 'suspended')

    await createLinkAndLogin(page, orgId, migrationResponse.email)

    // We can still create PERN when accreditation is suspended and links should be available
    let accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Suspended')

    let regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await dashboardPage.selectTableLink(1, 1)

    expect(
      (await page.locator('a', { hasText: 'Create new PERN' }).count()) > 0
    ).toBe(true)

    await wasteRecordsPage.managePERNsLink().click()
    await expect(
      page.getByRole('heading', { name: 'Select a PERN' })
    ).toBeVisible()
    const pernListAddress = page.url()
    await prnDashboardPage.backLink().click()

    // now we cancel the accreditation, PERN links should be gone
    await updateStatus(orgId, 'cancelled')

    await dashboardPage.backLink().click()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')

    regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await dashboardPage.selectTableLink(1, 1)

    expect(
      (await page.locator('a', { hasText: 'Create new PERN' }).count()) > 0
    ).toBe(false)
    expect(
      (await page.locator('a', { hasText: 'Manage PERNs' }).count()) > 0
    ).toBe(false)

    // The PERN list that opened while suspended is now not found
    const response = await page.goto(pernListAddress)
    expect(response?.status()).toBe(404)
    await checkBodyText(page, 'Page not found', 10)
  })
})
