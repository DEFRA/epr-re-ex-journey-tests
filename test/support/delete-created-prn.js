import { expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { ConfirmDeletePRNPage } from 'page-objects/confirm.delete.prn.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from './apicalls.js'
import { defraIdStub } from './defra-id-stub.js'
import { createLinkAndLogin } from './login-helper.js'
import { tonnageWordings, tradingName } from './fixtures.js'

/**
 * Shared "create then delete a PRN/PERN" flow. Reprocessor Output
 * (@delprnoutput) and Exporter (@delprnexp) specs are identical apart from
 * test data, PRN/PERN wording, and the Exporter-only overseas-sites seeding
 * step, so both call this with a different config.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} config
 * @param {string} config.wasteProcessingType - 'Reprocessor' | 'Exporter'
 * @param {string} config.material - material param for createLinkedOrganisation
 * @param {string} config.regNumber
 * @param {string} config.accNumber
 * @param {string} [config.reprocessingType] - only set for Reprocessor scenarios, e.g. 'output'
 * @param {boolean} [config.seedOverseasSites] - Exporter-only setup step
 * @param {string} config.summaryLogFilePath
 * @param {string} config.expectedWasteBalance
 * @param {string} config.expectedDeductedWasteBalance
 * @param {boolean} [config.isPern]
 * @param {'createNewPRNLink'|'createNewPERNLink'} config.createNewLinkName
 * @param {'managePRNsLink'|'managePERNsLink'} config.manageLinkName
 */
export async function runDeleteCreatedPrn(
  page,
  {
    wasteProcessingType,
    material,
    regNumber,
    accNumber,
    reprocessingType,
    seedOverseasSites: shouldSeedOverseasSites = false,
    summaryLogFilePath,
    expectedWasteBalance,
    expectedDeductedWasteBalance,
    isPern = false,
    createNewLinkName,
    manageLinkName
  }
) {
  const wording = isPern ? 'PERN' : 'PRN'

  const homePage = new HomePage(page)
  const wasteRecordsPage = new WasteRecordsPage(page)
  const dashboardPage = new DashboardPage(page)
  const createPRNPage = new CreatePRNPage(page)
  const checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(page)
  const prnCreatedPage = new PRNCreatedPage(page)
  const prnDashboardPage = new PRNDashboardPage(page)
  const prnViewPage = new PRNViewPage(page)
  const confirmDeletePRNPage = new ConfirmDeletePRNPage(page)

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

  if (shouldSeedOverseasSites) {
    await seedOverseasSites(organisationDetails.refNo)
  }

  const user = await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  await uploadAndSubmitSummaryLog(
    organisationDetails.refNo,
    migrationResponse.registrationIds[0],
    defraIdStub.authHeader(user.userId),
    summaryLogFilePath
  )

  await dashboardPage.selectTableLink(1, 1)

  // Check waste balance amount from upload
  let wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
  expect(wasteBalanceAmount).toBe(expectedWasteBalance)

  await wasteRecordsPage[createNewLinkName]()

  await createPRNPage.createPrn(tonnageWordings.integer, tradingName, 'Testing')

  const headingText = await checkBeforeCreatingPrnPage.headingText()
  expect(headingText).toBe(`Check before creating ${wording}`)
  await checkBeforeCreatingPrnPage.createPRN()

  const message = await prnCreatedPage.messageText()

  const awaitingAuthorisationStatus = 'Awaiting authorisation'

  expect(message).toContain(`${wording} created`)
  expect(message).toContain(awaitingAuthorisationStatus)

  await prnCreatedPage.returnToRegistrationPage()
  await dashboardPage.selectTableLink(1, 1)

  // Check waste balance amount is deducted from creation
  wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
  expect(wasteBalanceAmount).toBe(expectedDeductedWasteBalance)

  await wasteRecordsPage[manageLinkName]()

  // Check No PRNs/PERNs have been issued yet message
  await prnDashboardPage.selectIssuedTab()
  const noIssuedPrnMessage = await prnDashboardPage.getNoIssuedPrnMessage()
  expect(noIssuedPrnMessage).toBe(`No ${wording}s have been issued yet.`)

  // Return to awaiting authorisation PRNs/PERNs
  await prnDashboardPage.selectAwaitingActionTab()
  await prnDashboardPage.selectAwaitingLink(1)

  // Test the back link on Delete confirmation page first
  await prnViewPage.deletePRNButton()

  let confirmDeleteHeadingText = await confirmDeletePRNPage.headingText()
  expect(confirmDeleteHeadingText).toBe(
    `Are you sure you want to delete this ${wording}?`
  )
  await confirmDeletePRNPage.selectBackLink()

  // Now delete the PRN/PERN
  await prnViewPage.deletePRNButton()
  confirmDeleteHeadingText = await confirmDeletePRNPage.headingText()
  expect(confirmDeleteHeadingText).toBe(
    `Are you sure you want to delete this ${wording}?`
  )
  await confirmDeletePRNPage.deletePrnAndCheckDoubleClickPrevented()

  const noCreatedPrnMessage = await prnDashboardPage.getNoCreatedPrnMessage()
  expect(noCreatedPrnMessage).toBe(`You have not created any ${wording}s.`)

  await prnDashboardPage.selectBackLink()

  // Check waste balance amount is now from the uploaded value and "returned" from the deleted PRN/PERN
  wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
  expect(wasteBalanceAmount).toBe(expectedWasteBalance)

  await homePage.signOut()
  await expect(page).toHaveTitle(/Signed out/)
}
