import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { ConfirmDeletePRNPage } from 'page-objects/confirm.delete.prn.page.js'
import { tonnageWordings, tradingName } from '../support/fixtures.js'

test.describe('Deleting Packing Recycling Notes (Reprocessor Output)', () => {
  test('Should be able to create and delete PRN for Plastic (Reprocessor Output) @delprnoutput', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const createPRNPage = new CreatePRNPage(page)
    const checkBeforeCreatingPRNPage = new CheckBeforeCreatingPRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const prnDashboardPage = new PRNDashboardPage(page)
    const prnViewPage = new PRNViewPage(page)
    const confirmDeletePRNPage = new ConfirmDeletePRNPage(page)

    const regNumber = 'R25SR500010912PL'
    const accNumber = 'R-ACC12145PL'

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Plastic (R3)',
        wasteProcessingType: 'Reprocessor'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    await dashboardPage.selectTableLink(1, 1)

    const expectedWasteBalance = '56,455.67 tonnes'
    // Check waste balance amount from upload
    let wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await wasteRecordsPage.createNewPRNLink()

    let issuerNotes = ''

    issuerNotes = 'Testing'
    await createPRNPage.createPrn(
      tonnageWordings.integer,
      tradingName,
      issuerNotes
    )

    const headingText = await checkBeforeCreatingPRNPage.headingText()
    expect(headingText).toBe('Check before creating PRN')
    await checkBeforeCreatingPRNPage.createPRN()

    const message = await prnCreatedPage.messageText()

    const awaitingAuthorisationStatus = 'Awaiting authorisation'

    expect(message).toContain('PRN created')
    expect(message).toContain(awaitingAuthorisationStatus)

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)

    const expectedDeductedWasteBalance = '56,252.67 tonnes'
    // Check waste balance amount is deducted from creation
    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedDeductedWasteBalance)

    await wasteRecordsPage.managePRNsLink()

    // Check No PRNs have been issued yet message
    await prnDashboardPage.selectIssuedTab()
    const noIssuedPrnMessage = await prnDashboardPage.getNoIssuedPrnMessage()
    expect(noIssuedPrnMessage).toBe('No PRNs have been issued yet.')

    // Return to awaiting authorisation PRNs
    await prnDashboardPage.selectAwaitingActionTab()
    await prnDashboardPage.selectAwaitingLink(1)

    // Test the back link on Delete PRN confirmation page first
    await prnViewPage.deletePRNButton()

    let confirmDeleteHeadingText = await confirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PRN?'
    )
    await confirmDeletePRNPage.selectBackLink()

    // Now delete the PRN
    await prnViewPage.deletePRNButton()
    confirmDeleteHeadingText = await confirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PRN?'
    )
    await confirmDeletePRNPage.deletePrnAndCheckDoubleClickPrevented()

    const noCreatedPrnMessage = await prnDashboardPage.getNoCreatedPrnMessage()
    expect(noCreatedPrnMessage).toBe('You have not created any PRNs.')

    await prnDashboardPage.selectBackLink()

    // Check waste balance amount is now from the uploaded value and "returned" from the deleted PRN
    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
