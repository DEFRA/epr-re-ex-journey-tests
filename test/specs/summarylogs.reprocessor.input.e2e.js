import { test, expect } from '@playwright/test'
import { DefraIdStubPage } from 'page-objects/defra.id.stub.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'

test.describe('Summary Logs Reprocessor Input', () => {
  test('Should be able to link a user to an organisation and submit a spreadsheet @reproInput', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const defraIdStubPage = new DefraIdStubPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'input',
          regNumber: 'R25SR500030912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        }
      ]
    )

    await createAndRegisterDefraIdUser(migrationResponse.email)

    await homePage.openStart()

    // PAE-743: Site Furniture checks
    const href = await homePage.getStartNowHref()
    expect(href).toBe('/login')

    const phaseTag = await homePage.getPhaseTagText()
    expect(phaseTag).toBe('Beta')

    const feedbackHref = await homePage.getFeedbackLinkHref()
    expect(feedbackHref).toBe('mailto:eprcustomerservice@defra.gov.uk')

    const feedbackText = await homePage.getFeedbackLinkText()
    expect(feedbackText).toBe('give your feedback by email')

    // Not signed in, navigation links do not display
    let navigationLinks = await homePage.navLinkElements()
    expect(navigationLinks.length).toBe(0)

    // PAE-743: End of Site Furniture checks

    await homePage.clickStartNow()

    await defraIdStubPage.loginViaEmail(migrationResponse.email)

    // Tests the linking of an organisation
    await homePage.linkRegistration()

    // Signed in, there should be navigation links now
    navigationLinks = await homePage.navLinkElements()
    expect(navigationLinks.length).toBeGreaterThanOrEqual(1)

    const navLinkTexts = await homePage.getNavLinkTexts()

    expect(navLinkTexts).toContain('Home')
    expect(navLinkTexts).toContain('Manage account')
    expect(navLinkTexts).toContain('Sign out')

    const homeHref = await homePage.getNavigationLinkHref('Home')
    expect(homeHref).toContain('/organisations/')

    const dashboardHeaderText = await dashboardPage.dashboardHeaderText()

    expect(dashboardHeaderText).toContain(
      organisationDetails.organisation.companyName
    )

    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, 'R25SR500030912PA', 10)
    await checkBodyText(page, 'ACC123456', 10)

    await wasteRecordsPage.submitSummaryLogLink()
    await expect(page).toHaveTitle(/Summary log: upload/)
    await uploadSummaryLogPage.uploadFile('resources/summary-log.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 60)
    await uploadSummaryLogPage.confirmAndCheckDoubleClickPrevented()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '391.62 tonnes', 10)

    await uploadSummaryLogPage.clickOnReturnToHomePage()

    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('391.62')

    await dashboardPage.selectLink(1)
    const wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('391.62 tonnes')

    // PAE-743: Sign out link is visible, hence able to sign out
    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)

    navigationLinks = await homePage.navLinkElements()
    expect(navigationLinks.length).toBe(0)
  })
})
