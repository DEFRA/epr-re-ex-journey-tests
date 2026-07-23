import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { TonnesNotRecycledPage } from 'page-objects/reports/tonnes.not.recycled.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'

const REG_NUMBER = 'R25SR5111050912PA'

test.describe('Declaration name validation @declarationValidation', () => {
  // All `test`s below build on one continuous, already-logged-in session (the
  // declaration page is reached once in beforeAll and re-submitted with
  // different names across tests) - shared across a whole describe block, so
  // it needs its own Page created via the `browser` fixture rather than the
  // per-test `page` fixture (which isn't available in beforeAll/afterAll).
  /** @type {import('@playwright/test').Page} */
  let page
  let monthlyReportDraftDeclarationPage

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    monthlyReportDraftDeclarationPage = new MonthlyReportDraftDeclarationPage(
      page
    )
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmationPage = new ConfirmationPage(page)

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Reprocessor',
        withoutAccreditation: true
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: REG_NUMBER,
          status: 'approved',
          withoutAccreditation: true
        }
      ]
    )

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      'resources/reprocessor-output-regonly.xlsx'
    )
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.manageReportsLink()

    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesRecycledPage.enterTonnage('12.50')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('7.50')
    await tonnesNotRecycledPage.continue()
    await reportSupportingInformationPage.continue()
    await reportCheckAnswersPage.createReport()
    await checkBodyText(page, 'report created', 30)

    await confirmationPage.goToReports()
    await reportsPage.selectActiveActionLink(1)
  })

  test.afterAll(async () => {
    const homePage = new HomePage(page)
    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
    await page.close()
  })

  test('should show error when name is empty @declarationValidationEmpty', async () => {
    await monthlyReportDraftDeclarationPage.continue()

    await checkBodyText(
      page,
      'You must enter your full name as it appears on this account',
      10
    )
  })

  test('should show error when name is too short @declarationValidationTooShort', async () => {
    await monthlyReportDraftDeclarationPage.enterFullName('A')
    await monthlyReportDraftDeclarationPage.continue()

    await checkBodyText(page, 'Your name must be more than one character', 10)
  })

  test('should show error when name is too long @declarationValidationTooLong', async () => {
    const longName = 'A'.repeat(256)
    await monthlyReportDraftDeclarationPage.enterFullName(longName)
    await monthlyReportDraftDeclarationPage.continue()

    await checkBodyText(page, 'Your name must be fewer than 255 characters', 10)
  })

  test('should show error when name contains invalid characters @declarationValidationInvalidChars', async () => {
    await monthlyReportDraftDeclarationPage.enterFullName('James@bond.com')
    await monthlyReportDraftDeclarationPage.continue()

    await checkBodyText(
      page,
      'Your name cannot contain these characters: @, #, $, %, &, <, >',
      10
    )
  })

  test('should submit successfully with a valid name @declarationValidationHappyPath', async () => {
    const reportSubmittedPage = new ReportSubmittedPage(page)

    await monthlyReportDraftDeclarationPage.confirmAndSubmit('James Bond')

    const confirmationText = await reportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')
  })
})
