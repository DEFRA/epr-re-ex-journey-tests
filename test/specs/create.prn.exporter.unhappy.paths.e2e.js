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
  secondTradingName as tradingName
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Create Packing Recycling Notes (Exporter)', () => {
  test('Should test various (Unhappy) paths for Create PRN Exporter @prnexporter', async ({
    page
  }) => {
    const checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(page)
    const confirmDiscardPRNPage = new ConfirmDiscardPRNPage(page)
    const createPRNPage = new CreatePRNPage(page)
    const homePage = new HomePage(page)
    const prnDashboardPage = new PRNDashboardPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)

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

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPERNLink()

    const prnHelper = new PrnHelper(page, true)

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
    await checkBeforeCreatingPrnPage.discardAndStartAgain()
    const discardHeading = await confirmDiscardPRNPage.headingText()
    expect(discardHeading).toBe('Are you sure you want to discard this PERN?')
    await confirmDiscardPRNPage.discardAndStartAgain()

    prnDetails.issuerNotes = 'Testing'
    await prnHelper.createAndCheckDraftPrn(prnDetails)

    // This time we go to the discard page, and check the back link works
    await checkBeforeCreatingPrnPage.discardAndStartAgain()
    await confirmDiscardPRNPage.selectBackLink()

    await checkBeforeCreatingPrnPage.createPRN()

    // Check Create PRN validation errors
    let createAPrnPageHeading = await createPRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PERN')
    let materialDetails = await createPRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Aluminium')

    await createPRNPage.continue()

    let errorMessages = await createPRNPage.errorMessages(2)
    expect(errorMessages).toEqual([
      'Enter PERN tonnage as a whole number',
      'Enter a packaging producer or compliance scheme'
    ])

    await prnHelper.createAndCheckDraftPrn(prnDetails)

    await checkBeforeCreatingPrnPage.createPRN()

    // Now we see an error message related to tonnage exceeding waste balance
    errorMessages = await createPRNPage.errorMessages(1)
    expect(errorMessages).toEqual([
      'The tonnage you entered exceeds your available waste balance'
    ])
    // End of Check Create PERN validation errors

    // Check Create a PERN page is accessible from PERN Dashboard button
    await homePage.homeLink()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePERNsLink()
    await prnDashboardPage.createAPrnButton()

    // Check we are on Create a PERN Page
    createAPrnPageHeading = await createPRNPage.headingText()
    expect(createAPrnPageHeading).toBe('Create a PERN')
    materialDetails = await createPRNPage.materialDetails()
    expect(materialDetails).toBe('Material: Aluminium')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
