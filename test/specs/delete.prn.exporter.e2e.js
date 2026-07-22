import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import CreatePRNPage from 'page-objects/create.prn.page.js'
import CheckBeforeCreatingPrnPage from 'page-objects/check.before.creating.prn.page.js'
import PrnCreatedPage from 'page-objects/prn.created.page.js'
import PrnDashboardPage from 'page-objects/prn.dashboard.page.js'
import PrnViewPage from 'page-objects/prn.view.page.js'
import ConfirmDeletePRNPage from 'page-objects/confirm.delete.prn.page.js'
import { tonnageWordings, tradingName } from '../support/fixtures.js'

describe('Deleting Packing Recycling Notes (Exporter)', () => {
  it('Should be able to create and delete PRN for Fibre (Exporter) @delprnexp', async () => {
    const regNumber = 'E25SR500020912FB'
    const accNumber = 'E-ACC12245FB'

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Fibre-based composite material (R3)',
        wasteProcessingType: 'Exporter'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    await seedOverseasSites(organisationDetails.refNo)

    const user = await createLinkAndLogin(
      organisationDetails.refNo,
      migrationResponse.email
    )

    const filePath = `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    await DashboardPage.selectTableLink(1, 1)

    const expectedWasteBalance = '1,580.71 tonnes'
    // Check waste balance amount from upload
    let wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await WasteRecordsPage.createNewPERNLink()

    let issuerNotes = ''

    issuerNotes = 'Testing'
    await CreatePRNPage.createPrn(
      tonnageWordings.integer,
      tradingName,
      issuerNotes
    )

    const headingText = await CheckBeforeCreatingPrnPage.headingText()
    expect(headingText).toBe('Check before creating PERN')
    await CheckBeforeCreatingPrnPage.createPRN()

    const message = await PrnCreatedPage.messageText()

    const awaitingAuthorisationStatus = 'Awaiting authorisation'

    expect(message).toContain('PERN created')
    expect(message).toContain(awaitingAuthorisationStatus)

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)

    const expectedDeductedWasteBalance = '1,377.71 tonnes'
    // Check waste balance amount is deducted from creation
    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedDeductedWasteBalance)

    await WasteRecordsPage.managePERNsLink()

    // Check No PERNs have been issued yet message
    await PrnDashboardPage.selectIssuedTab()
    const noIssuedPrnMessage = await PrnDashboardPage.getNoIssuedPrnMessage()
    expect(noIssuedPrnMessage).toBe('No PERNs have been issued yet.')

    // Return to awaiting authorisation PERNs
    await PrnDashboardPage.selectAwaitingActionTab()
    await PrnDashboardPage.selectAwaitingLink(1)

    // Test the back link on Delete PERN confirmation page first
    await PrnViewPage.deletePRNButton()

    let confirmDeleteHeadingText = await ConfirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PERN?'
    )
    await ConfirmDeletePRNPage.selectBackLink()

    // Now delete the PERN
    await PrnViewPage.deletePRNButton()
    confirmDeleteHeadingText = await ConfirmDeletePRNPage.headingText()
    expect(confirmDeleteHeadingText).toBe(
      'Are you sure you want to delete this PERN?'
    )
    await ConfirmDeletePRNPage.deletePrn()

    const noCreatedPrnMessage = await PrnDashboardPage.getNoCreatedPrnMessage()
    expect(noCreatedPrnMessage).toBe('You have not created any PERNs.')

    await PrnDashboardPage.selectBackLink()

    // Check waste balance amount is now from the uploaded value and "returned" from the deleted PRN
    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
