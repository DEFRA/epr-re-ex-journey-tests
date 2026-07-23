import { test, expect } from '@playwright/test'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { ConfirmDiscardPRNPage } from 'page-objects/confirm.discard.prn.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
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

test.describe('Creating Packing Recycling Notes', () => {
  test('Should test various (Unhappy) paths for Create PRN Reprocessor @createprn', async ({
    page
  }) => {
    const checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(page)
    const confirmDiscardPRNPage = new ConfirmDiscardPRNPage(page)
    const createPRNPage = new CreatePRNPage(page)
    const homePage = new HomePage(page)
    const prnDashboardPage = new PRNDashboardPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)

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

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink()

    const prnHelper = new PrnHelper(page)

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
    await checkBeforeCreatingPrnPage.discardAndStartAgain()
    const discardHeading = await confirmDiscardPRNPage.headingText()
    expect(discardHeading).toBe('Are you sure you want to discard this PRN?')
    await confirmDiscardPRNPage.discardAndCheckDoubleClickPrevented()

    prnDetails.issuerNotes = 'Testing'
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // This time we go to the discard page, and check the back link works
    await checkBeforeCreatingPrnPage.discardAndStartAgain()
    await confirmDiscardPRNPage.selectBackLink()

    await checkBeforeCreatingPrnPage.createPRN()

    // Check Create PRN validation errors
    let createAPrnPageHeading = await createPRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PRN')
    let materialDetails = await createPRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Paper and board')

    await createPRNPage.submitAndCheckDoubleClickPrevented()

    let errorMessages = await createPRNPage.errorMessages(2)
    expect(errorMessages).toEqual([
      'Enter PRN tonnage as a whole number',
      'Enter a packaging producer or compliance scheme'
    ])

    await prnHelper.createAndCheckDraftPrn(prnDetails)

    await checkBeforeCreatingPrnPage.createPRN()

    // Now we see an error message related to tonnage exceeding waste balance
    errorMessages = await createPRNPage.errorMessages(1)
    expect(errorMessages).toEqual([
      'The tonnage you entered exceeds your available waste balance'
    ])
    // End of Check Create PRN validation errors

    // Check Create a PRN page is accessible from PRN Dashboard button
    await homePage.homeLink()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink()
    await prnDashboardPage.createAPrnButton()

    // Check we are on Create a PRN Page
    createAPrnPageHeading = await createPRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PRN')
    materialDetails = await createPRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Paper and board')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
