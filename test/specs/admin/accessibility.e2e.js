import { test } from '@playwright/test'

import { HomePage } from 'page-objects/admin/home.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { OrsUploadPage } from 'page-objects/admin/ors.upload.page'
import { WasteRecordsExportPage } from 'page-objects/admin/waste.records.export.page'

import {
  createLinkedOrganisation,
  createSubmittedReport,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../../support/apicalls.js'
import {
  assertNoSeriousOrCriticalViolations,
  scanPageForAccessibilityViolations,
  tagAccessibilityTest
} from '../../support/accessibility.js'

test.describe('WCAG Accessibility', () => {
  test('Should have no Serious/Critical accessibility violations on the Admin UI sign-in page @smoketest @accessibility', async ({
    page
  }) => {
    const violations = []
    const loginPage = new AdminLoginPage(page)

    await tagAccessibilityTest('Admin sign-in page')

    await loginPage.open()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Sign in'))
    )

    await assertNoSeriousOrCriticalViolations(violations)
  })

  test('Should have no Serious/Critical accessibility violations across the main Admin UI pages @accessibility', async ({
    page
  }) => {
    const violations = []

    const loginPage = new AdminLoginPage(page)
    const homePage = new HomePage(page)
    const navigation = new Navigation(page)
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const orsUploadPage = new OrsUploadPage(page)
    const wasteRecordsExportPage = new WasteRecordsExportPage(page)

    await tagAccessibilityTest('Admin UI main pages')

    // Seed one organisation with a submitted report so the organisation
    // overview, registration overview and unsubmit confirmation pages have
    // real data to render instead of an empty state.
    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])
    await createSubmittedReport(linkedOrganisation.refNo)

    await loginPage.loginAsServiceMaintainer()
    violations.push(...(await scanPageForAccessibilityViolations(page, 'Home')))

    await navigation.clickOnLink('Organisations')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Organisations'))
    )

    await organisationsPage.searchFor(
      linkedOrganisation.organisation.companyName
    )
    await organisationsPage.viewLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Organisation overview'
      ))
    )

    await organisationOverviewPage.viewRegistrationLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Registration overview'
      ))
    )

    // Detour into the Unsubmit confirmation page and back, without
    // confirming the unsubmit, so it gets scanned without mutating the
    // seeded report.
    const reportsData = await registrationOverviewPage.getReportsTableData()
    const submittedRowIndex = reportsData.findIndex((row) =>
      row.actions.includes('Unsubmit')
    )
    if (submittedRowIndex >= 0) {
      await registrationOverviewPage.clickOnUnsubmitReportLink(
        submittedRowIndex + 1
      )
      violations.push(
        ...(await scanPageForAccessibilityViolations(
          page,
          'Confirm unsubmit report'
        ))
      )
      await page.goBack()
    }

    await navigation.clickOnLink('System logs')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'System logs'))
    )

    await navigation.clickOnLink('Public register')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Public register'))
    )

    await navigation.clickOnLink('Tonnage monitoring')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Tonnage monitoring'))
    )

    await navigation.clickOnLink('Queue management')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Queue management'))
    )

    await navigation.clickOnLink('Report submissions')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Report submissions'))
    )

    await navigation.clickOnLink('Overseas sites')
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Overseas sites'))
    )

    await orsUploadPage.open()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Upload ORS workbooks'
      ))
    )

    await wasteRecordsExportPage.open()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Waste records export'
      ))
    )

    // Sign-out redirects back to the (now unauthenticated) Home page rather
    // than a dedicated confirmation screen. Wait for the "Sign in" link
    // (rendered only once signed out) so the scan doesn't run mid-redirect -
    // axe's page.evaluate throws "Execution context was destroyed" if it
    // starts while the sign-out navigation is still settling.
    await homePage.signOut()
    await page.getByText('Sign in', { exact: true }).first().waitFor()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Home (signed out)'))
    )

    await assertNoSeriousOrCriticalViolations(violations)
  })
})
