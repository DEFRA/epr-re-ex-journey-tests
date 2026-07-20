import { browser, expect } from '@wdio/globals'
import CheckBeforeCreatingPrnPage from 'page-objects/check.before.creating.prn.page.js'
import ConfirmDiscardPRNPage from 'page-objects/confirm.discard.prn.page.js'
import CreatePRNPage from 'page-objects/create.prn.page.js'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import PrnDashboardPage from 'page-objects/prn.dashboard.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  createPrnDetails,
  secondTradingName as tradingName
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'

describe('Create Packing Recycling Notes (Exporter) @smoketest', () => {
  it('Should test various (Unhappy) paths for Create PRN Exporter @prnexporter', async () => {
    const regNumber = 'E25SR500020912AL'
    const accNumber = 'E-ACC12245AL'

    const materialDesc = 'Aluminium'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
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

    await WasteRecordsPage.createNewPERNLink()

    const prnHelper = new PrnHelper(true)

    const prnDetails = createPrnDetails({
      tradingName,
      issuerNotes: '',
      organisationDetails,
      materialDesc,
      accNumber,
      process: 'R4'
    })

    // Empty issuer notes, PERN created should say "Not provided"
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // Discard the first attempt
    await CheckBeforeCreatingPrnPage.discardAndStartAgain()
    const discardHeading = await ConfirmDiscardPRNPage.headingText()
    expect(discardHeading).toBe('Are you sure you want to discard this PERN?')
    await ConfirmDiscardPRNPage.discardAndStartAgain()

    prnDetails.issuerNotes = 'Testing'
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // This time we go to the discard page, and check the back link works
    await CheckBeforeCreatingPrnPage.discardAndStartAgain()
    await ConfirmDiscardPRNPage.selectBackLink()

    await CheckBeforeCreatingPrnPage.createPRN()

    // Check Create PRN validation errors
    let createAPrnPageHeading = await CreatePRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PERN')
    let materialDetails = await CreatePRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Aluminium')

    await CreatePRNPage.continue()

    let errorMessages = await CreatePRNPage.errorMessages(2)
    expect(errorMessages).toEqual([
      'Enter PERN tonnage as a whole number',
      'Enter a packaging producer or compliance scheme'
    ])

    await prnHelper.createAndCheckDraftPrn(prnDetails)

    await CheckBeforeCreatingPrnPage.createPRN()

    // Now we see an error message related to tonnage exceeding waste balance
    errorMessages = await CreatePRNPage.errorMessages(1)
    expect(errorMessages).toEqual([
      'The tonnage you entered exceeds your available waste balance'
    ])
    // End of Check Create PERN validation errors

    // Check Create a PERN page is accessible from PERN Dashboard button
    await HomePage.homeLink()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.managePERNsLink()
    await PrnDashboardPage.createAPrnButton()

    // Check we are on Create a PERN Page
    createAPrnPageHeading = await CreatePRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PERN')
    materialDetails = await CreatePRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Aluminium')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
