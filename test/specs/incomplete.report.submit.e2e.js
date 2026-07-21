import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { uploadSummaryLogAndNavigateToReports } from '../support/report-navigation.js'

const REG_NUMBER = 'R25SR500010912PA'
const ACC_NUMBER = 'R-ACC12145PA'

const setupAccreditedReprocessor = async () => {
  const organisationDetails = await createLinkedOrganisation([
    { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
  ])

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [
      {
        reprocessingType: 'output',
        regNumber: REG_NUMBER,
        accNumber: ACC_NUMBER,
        status: 'approved'
      }
    ]
  )

  await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)
}

describe('Incomplete report submit @incompleteReportBlock', () => {
  before(async () => {
    await setupAccreditedReprocessor()
    await uploadSummaryLogAndNavigateToReports(
      `resources/sanity/reprocessorOutput_${ACC_NUMBER}_${REG_NUMBER}.xlsx`
    )
  })

  after(async () => {
    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('rejects submit on check-your-answers when manual fields are unpopulated @incompleteReportBlockReprocessor', async () => {
    // Start the report — creates it in `in_progress` with null manual fields
    // (tonnageRecycled, tonnageNotRecycled, prn.totalRevenue, prn.freeTonnage).
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // Navigate straight to check-your-answers, skipping every data-entry page.
    const currentUrl = await browser.getUrl()
    const periodBase = currentUrl.split('/reports/')[0] + '/reports/'
    const periodPath = currentUrl
      .split('/reports/')[1]
      .split('/')
      .slice(0, 5)
      .join('/')
    await browser.url(`${periodBase}${periodPath}/check-your-answers`)

    const checkHeading = await ReportCheckAnswersPage.headingText()
    expect(checkHeading).toBe(
      'Check your answers before you create this draft report'
    )

    // Click "Create draft report" — BE returns 400, FE surfaces the generic
    // error page. The happy-path confirmation text is absent.
    await ReportCheckAnswersPage.createReport()

    await checkBodyText('Bad request', 10)
    await checkBodyTextDoesNotInclude('report created', 10)
  })
})
