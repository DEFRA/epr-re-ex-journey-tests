import { test, expect } from '@playwright/test'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
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
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from 'page-objects/check.summary.log.page.js'
import {
  createLinkAndLogin,
  loginViaHomePage
} from '../support/login-helper.js'

test.describe('@registered-only', () => {
  test('should be able to upload Registered Only Reprocessor Summary Logs for registered-only operators and display unaccredited registrations alongside accredited ones @regOnlyReprocessor', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)
    const homePage = new HomePage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)

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
    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    const row = await dashboardPage.getTableRow(1, 1)
    expect(row.get('Accreditation')).toBe('Not accredited')
    expect(row.get('Available waste balance (tonnes)')).toBe('Not applicable')

    let material = await dashboardPage.getMaterial(2, 1)
    expect(material).toBe('Fibre-based composite')

    material = await dashboardPage.getMaterial(3, 1)
    expect(material).toBe('Plastic')

    await dashboardPage.selectTableLink(1, 1)

    await checkBodyText(page, 'R25SR5111050912PA', 10)
    await checkBodyText(page, 'Upload your summary log', 10)
    await checkBodyTextDoesNotInclude(page, 'Available waste balance', 5)
    await checkBodyTextDoesNotInclude(page, 'Accreditation number', 5)
    await checkBodyTextDoesNotInclude(page, 'PRNs', 5)

    await wasteRecordsPage.submitSummaryLogLink()
    await expect(page).toHaveTitle(/Summary log: upload/)
    await uploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly.xlsx'
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 60)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(page, 'new loads will be recorded', 30)
    await checkBodyText(page, 'These have been added to your summary log.', 30)
    await checkSummaryLogPage.upload()

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude(page, 'Your updated waste balance', 10)
    await uploadSummaryLogPage.clickOnReturnToHomePage()

    await dashboardPage.selectExportingTab()
    const exportRow = await dashboardPage.getTableRow(1, 1)
    expect(exportRow.get('Accreditation')).toBe('Not accredited')
    expect(exportRow.get('Available waste balance (tonnes)')).toBe(
      'Not applicable'
    )

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should be able to upload Registered Only Exporter Summary Logs for registered-only operator and display unaccredited registrations alongside accredited ones @regOnlyExporter', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)
    const homePage = new HomePage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)

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

    await loginViaHomePage(page, migrationResponse.email)

    await dashboardPage.selectTableLink(1, 1)
    await checkBodyText(page, 'E25SR500030913PA', 10)

    await wasteRecordsPage.submitSummaryLogLink()
    await expect(page).toHaveTitle(/Summary log: upload/)

    await uploadSummaryLogPage.uploadFile('resources/exporter-regonly.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 60)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(page, 'new loads will be recorded', 30)
    await checkBodyText(page, 'These have been added to your summary log.', 30)
    await checkSummaryLogPage.upload()

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude(page, 'Your updated waste balance', 10)
    await uploadSummaryLogPage.clickOnReturnToHomePage()

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
