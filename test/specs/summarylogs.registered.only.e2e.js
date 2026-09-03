import { test, expect } from '@playwright/test'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
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

test.describe('@registeredOnly', () => {
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
          regNumber: 'R26ER5000000002PA',
          status: 'approved',
          withoutAccreditation: true
        },
        {
          regNumber: 'R26EX5000000003PA',
          status: 'approved',
          withoutAccreditation: true
        },
        {
          reprocessingType: 'output',
          regNumber: 'R26ER5000000002FB',
          accNumber: 'A26ER5000000002FB',
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

    await checkBodyText(page, 'R26ER5000000002PA', 10)
    await checkBodyText(page, 'Upload your summary log', 10)
    await checkBodyTextDoesNotInclude(page, 'Available waste balance', 5)
    await checkBodyTextDoesNotInclude(page, 'Accreditation number', 5)
    await checkBodyTextDoesNotInclude(page, 'PRNs', 5)

    await wasteRecordsPage.submitSummaryLogLink().click()
    await expect(page).toHaveTitle(/Summary log: upload/)
    await uploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly.xlsx'
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 30)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(page, 'new loads will be recorded', 30)
    await checkBodyText(page, 'These have been added to your summary log.', 30)
    await checkSummaryLogPage.uploadButton().click()

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude(page, 'Your updated waste balance', 10)
    await uploadSummaryLogPage.returnToHomePageLink().click()

    await dashboardPage.exportingTabLink().click()
    const exportRow = await dashboardPage.getTableRow(1, 1)
    expect(exportRow.get('Accreditation')).toBe('Not accredited')
    expect(exportRow.get('Available waste balance (tonnes)')).toBe(
      'Not applicable'
    )

    await homePage.signOutLink().click()
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
          regNumber: 'R26EX5000000003PA',
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
    await checkBodyText(page, 'R26EX5000000003PA', 10)

    await wasteRecordsPage.submitSummaryLogLink().click()
    await expect(page).toHaveTitle(/Summary log: upload/)

    await uploadSummaryLogPage.uploadFile('resources/exporter-regonly.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 30)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(page, 'new loads will be recorded', 30)
    await checkBodyText(page, 'These have been added to your summary log.', 30)
    await checkSummaryLogPage.uploadButton().click()

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyTextDoesNotInclude(page, 'Your updated waste balance', 10)
    await uploadSummaryLogPage.returnToHomePageLink().click()

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
