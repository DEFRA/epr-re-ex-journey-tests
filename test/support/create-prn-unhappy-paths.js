import { expect } from '@playwright/test'
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
} from './apicalls.js'
import { createPrnDetails } from './fixtures.js'
import { PrnHelper } from './prn.helper.js'
import { createLinkAndLogin } from './login-helper.js'

/**
 * Shared "unhappy paths" flow for creating a PRN/PERN: create a draft, discard
 * it twice (once via double-click-prevented button, once via the back link),
 * then exercise the Create page's validation errors, and confirm the Create
 * page is reachable from the PRN/PERN dashboard. Reprocessor (@createprn) and
 * Exporter (@prnexporter) specs are identical apart from test data and
 * PRN/PERN wording, so both call this with a different config.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} config
 * @param {string} config.wasteProcessingType - 'Reprocessor' | 'Exporter'
 * @param {string} config.material - material param for createLinkedOrganisation, e.g. 'Paper or board (R3)'
 * @param {string} config.materialDesc - display text on the Create page, e.g. 'Paper and board'
 * @param {string} config.regNumber
 * @param {string} config.accNumber
 * @param {string} [config.reprocessingType] - only set for Reprocessor scenarios, e.g. 'input'
 * @param {string} config.tradingName
 * @param {string} [config.process] - defaults to 'R3' in createPrnDetails when omitted
 * @param {boolean} [config.isPern]
 * @param {'createNewPRNLink'|'createNewPERNLink'} config.createNewLinkName
 * @param {'managePRNsLink'|'managePERNsLink'} config.manageLinkName
 */
export async function runCreatePrnUnhappyPaths(
  page,
  {
    wasteProcessingType,
    material,
    materialDesc,
    regNumber,
    accNumber,
    reprocessingType,
    tradingName,
    process,
    isPern = false,
    createNewLinkName,
    manageLinkName
  }
) {
  const wording = isPern ? 'PERN' : 'PRN'

  const checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(page)
  const confirmDiscardPRNPage = new ConfirmDiscardPRNPage(page)
  const createPRNPage = new CreatePRNPage(page)
  const homePage = new HomePage(page)
  const prnDashboardPage = new PRNDashboardPage(page)
  const dashboardPage = new DashboardPage(page)
  const wasteRecordsPage = new WasteRecordsPage(page)

  const organisationDetails = await createLinkedOrganisation([
    { material, wasteProcessingType }
  ])

  const migrationEntry = {
    regNumber,
    accNumber,
    status: 'approved'
  }
  if (reprocessingType) {
    migrationEntry.reprocessingType = reprocessingType
  }

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [migrationEntry]
  )

  await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  await dashboardPage.selectTableLink(1, 1)

  await wasteRecordsPage[createNewLinkName]()

  const prnHelper = new PrnHelper(page, isPern)

  const prnDetails = createPrnDetails({
    tradingName,
    issuerNotes: '',
    organisationDetails,
    materialDesc,
    accNumber,
    ...(process ? { process } : {})
  })

  // Empty issuer notes, PRN/PERN created should say "Not provided"
  await prnHelper.createAndCheckDraftPrn(prnDetails)

  // Discard the first attempt
  await checkBeforeCreatingPrnPage.discardAndStartAgain()
  const discardHeading = await confirmDiscardPRNPage.headingText()
  expect(discardHeading).toBe(
    `Are you sure you want to discard this ${wording}?`
  )
  await confirmDiscardPRNPage.discardAndCheckDoubleClickPrevented()

  prnDetails.issuerNotes = 'Testing'
  await prnHelper.createAndCheckDraftPrn(prnDetails)

  // This time we go to the discard page, and check the back link works
  await checkBeforeCreatingPrnPage.discardAndStartAgain()
  await confirmDiscardPRNPage.selectBackLink()

  await checkBeforeCreatingPrnPage.createPRN()

  // Check Create PRN/PERN validation errors
  let createAPrnPageHeading = await createPRNPage.headingText()
  expect(createAPrnPageHeading).toBe(`Create a ${wording}`)
  let materialDetails = await createPRNPage.materialDetails()
  expect(materialDetails).toBe(`Material: ${materialDesc}`)

  await createPRNPage.submitAndCheckDoubleClickPrevented()

  let errorMessages = await createPRNPage.errorMessages(2)
  expect(errorMessages).toEqual([
    `Enter ${wording} tonnage as a whole number`,
    'Enter a packaging producer or compliance scheme'
  ])

  await prnHelper.createAndCheckDraftPrn(prnDetails)

  await checkBeforeCreatingPrnPage.createPRN()

  // Now we see an error message related to tonnage exceeding waste balance
  errorMessages = await createPRNPage.errorMessages(1)
  expect(errorMessages).toEqual([
    'The tonnage you entered exceeds your available waste balance'
  ])
  // End of Check Create PRN/PERN validation errors

  // Check Create a PRN/PERN page is accessible from the PRN/PERN Dashboard button
  await homePage.homeLink()
  await dashboardPage.selectTableLink(1, 1)
  await wasteRecordsPage[manageLinkName]()
  await prnDashboardPage.createAPrnButton()

  // Check we are on the Create a PRN/PERN Page
  createAPrnPageHeading = await createPRNPage.headingText()
  expect(createAPrnPageHeading).toBe(`Create a ${wording}`)
  materialDetails = await createPRNPage.materialDetails()
  expect(materialDetails).toBe(`Material: ${materialDesc}`)

  await homePage.signOut()
  await expect(page).toHaveTitle(/Signed out/)
}
