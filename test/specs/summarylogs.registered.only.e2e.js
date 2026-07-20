import { browser, expect } from '@wdio/globals'
import DashboardPage from 'page-objects/dashboard.page.js'
import HomePage from 'page-objects/homepage.js'
import WasteRecordsPage from 'page-objects/waste.records.page.js'
import seedOverseasSites, {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import EnhancedCheckSummaryLogPage from 'page-objects/enhanced.check.summary.log.page.js'
import {
  createLinkAndLogin,
  loginViaHomePage
} from '../support/login-helper.js'

describe('@registered-only', () => {
  it('should be able to upload Registered Only Reprocessor Summary Logs for registered-only operators and display unaccredited registrations alongside accredited ones @regOnlyReprocessor', async () => {
    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Reprocessor',
        withoutAccreditation: true
      },
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter',
        withoutAccreditation: true
      },
      {
        material: 'Fibre-based composite material (R3)',
        wasteProcessingType: 'Reprocessor'
      },
      {
        material: 'Plastic (R3)',
        wasteProcessingType: 'Reprocessor'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912PA',
          status: 'approved',
          withoutAccreditation: true
        },
        {
          regNumber: 'E25SR500030913PA',
          status: 'approved',
          withoutAccreditation: true
        },
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050913FB',
          accNumber: 'ACC1234567',
          status: 'approved'
        },
        {
          reprocessingType: 'input',
          regNumber: 'RI25SR51110509124PL',
          accNumber: 'ACCI1234567',
          status: 'approved'
        }
      ]
    )
    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    const row = await DashboardPage.getTableRow(1, 1)
    expect(row.get('Accreditation')).toBe('Not accredited')
    expect(row.get('Available waste balance (tonnes)')).toBe('Not applicable')

    let material = await DashboardPage.getMaterial(2, 1)
    expect(material).toBe('Fibre-based composite')

    material = await DashboardPage.getMaterial(3, 1)
    expect(material).toBe('Plastic')

    await DashboardPage.selectTableLink(1, 1)

    await checkBodyText('R25SR5111050912PA', 10)
    await checkBodyText('Upload your summary log', 10)
    await checkBodyTextDoesNotInclude('Available waste balance', 5)
    await checkBodyTextDoesNotInclude('Accreditation number', 5)
    await checkBodyTextDoesNotInclude('PRNs', 5)

    await WasteRecordsPage.submitSummaryLogLink()
    await expect(browser).toHaveTitle(
      expect.stringContaining('Summary log: upload')
    )
    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)

    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: new loads', 30)
    await checkBodyText('new loads will be recorded', 30)
    await checkBodyText('These have been added to your summary log.', 30)
    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude('Your updated waste balance', 10)
    await UploadSummaryLogPage.clickOnReturnToHomePage()

    await DashboardPage.selectExportingTab()
    const exportRow = await DashboardPage.getTableRow(1, 1)
    expect(exportRow.get('Accreditation')).toBe('Not accredited')
    expect(exportRow.get('Available waste balance (tonnes)')).toBe(
      'Not applicable'
    )

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should be able to upload Registered Only Exporter Summary Logs for registered-only operator and display unaccredited registrations alongside accredited ones @regOnlyExporter', async () => {
    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter',
        withoutAccreditation: true
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber: 'E25SR500030913PA',
          status: 'approved',
          withoutAccreditation: true
        }
      ]
    )
    const user = await createAndRegisterDefraIdUser(migrationResponse.email)

    await seedOverseasSites(
      organisationDetails.refNo,
      [0],
      [143, 297, 565, 893]
    )

    await linkDefraIdUser(
      organisationDetails.refNo,
      user.userId,
      migrationResponse.email
    )

    await loginViaHomePage(migrationResponse.email)

    await DashboardPage.selectTableLink(1, 1)
    await checkBodyText('E25SR500030913PA', 10)

    await WasteRecordsPage.submitSummaryLogLink()
    await expect(browser).toHaveTitle(
      expect.stringContaining('Summary log: upload')
    )

    await UploadSummaryLogPage.uploadFile('resources/exporter-regonly.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)

    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: new loads', 30)
    await checkBodyText('new loads will be recorded', 30)
    await checkBodyText('These have been added to your summary log.', 30)
    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude('Your updated waste balance', 10)
    await UploadSummaryLogPage.clickOnReturnToHomePage()

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
