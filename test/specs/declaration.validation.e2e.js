import { $, browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ConfirmationPage from 'page-objects/reports/confirmation.page.js'
import DashboardPage from 'page-objects/dashboard.page.js'
import TonnesNotRecycledPage from 'page-objects/reports/tonnes.not.recycled.page.js'
import TonnesRecycledPage from 'page-objects/reports/tonnes.recycled.page.js'
import WasteRecordsPage from 'page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'

const REG_NUMBER = 'R25SR5111050912PA'

describe('Declaration name validation @declarationValidation', () => {
  before(async () => {
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
      organisationDetails.refNo,
      migrationResponse.email
    )

    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      'resources/reprocessor-output-regonly.xlsx'
    )
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()

    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()
    await TonnesRecycledPage.enterTonnage('12.50')
    await TonnesRecycledPage.continue()
    await TonnesNotRecycledPage.enterTonnage('7.50')
    await TonnesNotRecycledPage.continue()
    await ReportSupportingInformationPage.continue()
    await ReportCheckAnswersPage.createReport()
    await checkBodyText('report created', 30)

    await ConfirmationPage.goToReports()
    await ReportsPage.selectActiveActionLink(1)
  })

  after(async () => {
    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should show error when name is empty @declarationValidationEmpty', async () => {
    const submitButton = await $('#main-content button[type=submit]')
    await submitButton.waitForClickable({ timeout: 5000 })
    await submitButton.click()

    await checkBodyText(
      'You must enter your full name as it appears on this account',
      10
    )
  })

  it('should show error when name is too short @declarationValidationTooShort', async () => {
    await MonthlyReportDraftDeclarationPage.enterFullName('A')
    const submitButton = await $('#main-content button[type=submit]')
    await submitButton.waitForClickable({ timeout: 5000 })
    await submitButton.click()

    await checkBodyText('Your name must be more than one character', 10)
  })

  it('should show error when name is too long @declarationValidationTooLong', async () => {
    const longName = 'A'.repeat(256)
    await MonthlyReportDraftDeclarationPage.enterFullName(longName)
    const submitButton = await $('#main-content button[type=submit]')
    await submitButton.waitForClickable({ timeout: 5000 })
    await submitButton.click()

    await checkBodyText('Your name must be fewer than 255 characters', 10)
  })

  it('should show error when name contains invalid characters @declarationValidationInvalidChars', async () => {
    await MonthlyReportDraftDeclarationPage.enterFullName('James@bond.com')
    const submitButton = await $('#main-content button[type=submit]')
    await submitButton.waitForClickable({ timeout: 5000 })
    await submitButton.click()

    await checkBodyText(
      'Your name cannot contain these characters: @, #, $, %, &, <, >',
      10
    )
  })

  it('should submit successfully with a valid name @declarationValidationHappyPath', async () => {
    await MonthlyReportDraftDeclarationPage.confirmAndSubmit('James Bond')

    const confirmationText = await ReportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')
  })
})
