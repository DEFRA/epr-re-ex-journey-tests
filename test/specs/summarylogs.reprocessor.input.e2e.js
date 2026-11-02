import { test, expect } from '@playwright/test'
import { DefraIdStubPage } from 'page-objects/defra.id.stub.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  checkOnCheckPage,
  checkOnUploadPage
} from '../support/summary-log-checks.js'
import { createAndRegisterDefraIdUser } from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import {
  summaryLogDatedAt,
  summaryLogNumbered
} from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'
test.describe('Summary Logs Reprocessor Input', () => {
  test('Should be able to link a user to an organisation, submit a spreadsheet, and see why an adjusted load reduces the balance @reproInput @adjustedReducedReason @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const defraIdStubPage = new DefraIdStubPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    const numbers = generateNumbers({
      wasteProcessingType: 'reprocessor',
      materialSuffix: 'PA'
    })

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'input',
          ...numbers,
          status: 'approved'
        }
      ]
    )

    await createAndRegisterDefraIdUser(migrationResponse.email)

    await homePage.openStart()

    // PAE-743: Site Furniture checks
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

    await homePage.startNowButton().click()

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

    await homePage.navigationLink('Home').click()

    const dashboardHeaderText = await dashboardPage.dashboardHeaderText()

    expect(dashboardHeaderText).toContain(
      organisationDetails.organisation.companyName
    )

    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, numbers.regNumber, 10)
    await checkBodyText(page, numbers.accNumber, 10)

    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page)
    const today = new Date()
    await uploadSummaryLogPage.uploadFile(
      await summaryLogNumbered(
        await summaryLogDatedAt('resources/summary-log.xlsx', today),
        numbers
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkOnCheckPage(page)
    await uploadSummaryLogPage.confirmAndCheckDoubleClickPrevented()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await uploadSummaryLogPage.checkUploaded()
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '391.62 tonnes', 10)

    await uploadSummaryLogPage.returnToHomePageLink().click()

    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('391.62')

    await dashboardPage.selectLink(1)
    const wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('391.62')

    // PAE-1743: an adjusted load excluded for a reason OTHER than missing data
    // must show that reason under the "reduced" heading, not sit bare under a
    // "missing data" one. The per-code reason strings and the PRN->PERN wording
    // swap are unit-tested (controller.test.js), so one journey through the
    // canonical PRN case is enough here.
    //
    // Re-upload with row 1001's PRN answer flipped to Yes, excluding it — an
    // open-period adjustment that reverses its earlier 339.99t contribution.
    await wasteRecordsPage.submitSummaryLogLink().click()
    await uploadSummaryLogPage.uploadFile(
      await summaryLogNumbered(
        await summaryLogDatedAt(
          'resources/reprocessor-input-prn-issued.xlsx',
          today
        ),
        numbers
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page)
    await checkBodyText(page, 'Open periods: adjusted loads', 30)

    await checkSummaryLogPage.expandAllLoadDetails()

    const detailsText = await checkSummaryLogPage.loadDetailsText()
    const rows = await checkSummaryLogPage.loadRowItems()
    const bodyText = await page.evaluate(() => document.body.innerText)

    // The balance still moves by the excluded load's 339.99t — the ticket is
    // explicit that the balance was correct and only the reason was hidden, so
    // guard the value, not just the direction.
    expect(bodyText).toContain(
      'The adjusted loads will remove 339.99 tonnes from your waste balance.'
    )
    expect(detailsText).toContain('This load has reduced your waste balance')
    // The reported defect: pre-fix, row 1001 sat bare under the "missing data"
    // heading. Assert its reason shows and that heading is gone.
    expect(rows).toContain(
      'Row ID: 1001. A PRN was already issued for this load'
    )
    expect(bodyText).not.toContain(
      'does NOT have all the required summary log data'
    )

    // PAE-743: Sign out link is visible, hence able to sign out
    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)

    navigationLinks = await homePage.navLinkElements()
    expect(navigationLinks.length).toBe(0)
  })
})
