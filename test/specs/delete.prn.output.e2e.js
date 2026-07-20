import { browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import CreatePRNPage from 'page-objects/create.prn.page.js'
import CheckBeforeCreatingPrnPage from 'page-objects/check.before.creating.prn.page.js'
import PrnCreatedPage from 'page-objects/prn.created.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import PrnDashboardPage from 'page-objects/prn.dashboard.page.js'
import PrnViewPage from 'page-objects/prn.view.page.js'
import ConfirmDeletePRNPage from 'page-objects/confirm.delete.prn.page.js'
import { tonnageWordings, tradingName } from '../support/fixtures.js'

describe('Deleting Packing Recycling Notes (Reprocessor Output)', () => {
  it('Should be able to create and delete PRN for Plastic (Reprocessor Output) @delprnoutput @smoketest', async () => {
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

    const user = await createAndRegisterDefraIdUser(migrationResponse.email)
    await linkDefraIdUser(
      organisationDetails.refNo,
      user.userId,
      migrationResponse.email
    )

    await HomePage.openStart()
    await HomePage.clickStartNow()

    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await DashboardPage.selectTableLink(1, 1)

    const expectedWasteBalance = '56,455.67 tonnes'
    // Check waste balance amount from upload
    let wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await WasteRecordsPage.createNewPRNLink()

    let issuerNotes = ''

    issuerNotes = 'Testing'
    await CreatePRNPage.createPrn(
      tonnageWordings.integer,
      tradingName,
      issuerNotes
    )

    const headingText = await CheckBeforeCreatingPrnPage.headingText()
    expect(headingText).toBe('Check before creating PRN')
    await CheckBeforeCreatingPrnPage.createPRN()

    const message = await PrnCreatedPage.messageText()

    const awaitingAuthorisationStatus = 'Awaiting authorisation'

    expect(message).toContain('PRN created')
    expect(message).toContain(awaitingAuthorisationStatus)

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)

    const expectedDeductedWasteBalance = '56,252.67 tonnes'
    // Check waste balance amount is deducted from creation
    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedDeductedWasteBalance)

    await WasteRecordsPage.managePRNsLink()

    // Check No PRNs have been issued yet message
    await PrnDashboardPage.selectIssuedTab()
    const noIssuedPrnMessage = await PrnDashboardPage.getNoIssuedPrnMessage()
    expect(noIssuedPrnMessage).toBe('No PRNs have been issued yet.')

    // Return to awaiting authorisation PRNs
    await PrnDashboardPage.selectAwaitingActionTab()
    await PrnDashboardPage.selectAwaitingLink(1)

    // Test the back link on Delete PRN confirmation page first
    await PrnViewPage.deletePRNButton()

    let confirmDeleteHeadingText = await ConfirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PRN?'
    )
    await ConfirmDeletePRNPage.selectBackLink()

    // Now delete the PRN
    await PrnViewPage.deletePRNButton()
    confirmDeleteHeadingText = await ConfirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PRN?'
    )
    await ConfirmDeletePRNPage.deletePrnAndCheckDoubleClickPrevented()

    const noCreatedPrnMessage = await PrnDashboardPage.getNoCreatedPrnMessage()
    expect(noCreatedPrnMessage).toBe('You have not created any PRNs.')

    await PrnDashboardPage.selectBackLink()

    // Check waste balance amount is now from the uploaded value and "returned" from the deleted PRN
    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
