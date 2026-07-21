import { browser, expect } from '@wdio/globals'
import CheckBeforeCreatingPrnPage from 'page-objects/check.before.creating.prn.page.js'
import ConfirmDiscardPRNPage from 'page-objects/confirm.discard.prn.page.js'
import CreatePRNPage from 'page-objects/create.prn.page.js'
import HomePage from 'page-objects/homepage.js'
import PrnDashboardPage from 'page-objects/prn.dashboard.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  createPrnDetails,
  thirdTradingName as tradingName
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Creating Packing Recycling Notes', () => {
  it('Should test various (Unhappy) paths for Create PRN Reprocessor @createprn', async () => {
    const regNumber = 'R25SR500000912PA'
    const accNumber = 'R-ACC12045PA'

    const materialDesc = 'Paper and board'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'input',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.createNewPRNLink()

    const prnHelper = new PrnHelper()

    const prnDetails = createPrnDetails({
      tradingName,
      issuerNotes: '',
      organisationDetails,
      materialDesc,
      accNumber
    })

    // Empty issuer notes, PRN created should say "Not provided"
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // Discard the first attempt
    await CheckBeforeCreatingPrnPage.discardAndStartAgain()
    const discardHeading = await ConfirmDiscardPRNPage.headingText()
    expect(discardHeading).toBe('Are you sure you want to discard this PRN?')
    await ConfirmDiscardPRNPage.discardAndCheckDoubleClickPrevented()

    prnDetails.issuerNotes = 'Testing'
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // This time we go to the discard page, and check the back link works
    await CheckBeforeCreatingPrnPage.discardAndStartAgain()
    await ConfirmDiscardPRNPage.selectBackLink()

    await CheckBeforeCreatingPrnPage.createPRN()

    // Check Create PRN validation errors
    let createAPrnPageHeading = await CreatePRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PRN')
    let materialDetails = await CreatePRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Paper and board')

    await CreatePRNPage.submitAndCheckDoubleClickPrevented()

    let errorMessages = await CreatePRNPage.errorMessages(2)
    expect(errorMessages).toEqual([
      'Enter PRN tonnage as a whole number',
      'Enter a packaging producer or compliance scheme'
    ])

    await prnHelper.createAndCheckDraftPrn(prnDetails)

    await CheckBeforeCreatingPrnPage.createPRN()

    // Now we see an error message related to tonnage exceeding waste balance
    errorMessages = await CreatePRNPage.errorMessages(1)
    expect(errorMessages).toEqual([
      'The tonnage you entered exceeds your available waste balance'
    ])
    // End of Check Create PRN validation errors

    // Check Create a PRN page is accessible from PRN Dashboard button
    await HomePage.homeLink()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.managePRNsLink()
    await PrnDashboardPage.createAPrnButton()

    // Check we are on Create a PRN Page
    createAPrnPageHeading = await CreatePRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PRN')
    materialDetails = await CreatePRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Paper and board')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
