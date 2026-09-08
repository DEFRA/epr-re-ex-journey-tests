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
import { RegisteredOnlyPeriodPage } from 'page-objects/regulator/registered-only-period.page.js'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page.js'
import { RegulatorHomePage } from 'page-objects/regulator/home.page.js'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page.js'
import { WasteBalanceLedgerPage } from 'page-objects/waste.balance.ledger.page.js'
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

    // A registration held without an accreditation files its submissions into
    // a registered-only ledger rather than the waste balance one - a
    // regulator reads the same event from the other side of the journey.
    const regulatorLoginPage = new RegulatorLoginPage(page)
    const regulatorHomePage = new RegulatorHomePage(page)
    const regulatorDashboardPage = new DashboardPage(page)
    const registrationDetailsPage = new RegistrationDetailsPage(page)
    const registeredOnlyPeriodPage = new RegisteredOnlyPeriodPage(page)
    const ledgerPage = new WasteBalanceLedgerPage(page)

    await regulatorLoginPage.loginAsRegulator()

    await regulatorHomePage.searchFor(
      organisationDetails.organisation.companyName
    )
    await regulatorHomePage.actionLink(1).click()

    expect(await regulatorDashboardPage.dashboardHeaderText()).toContain(
      organisationDetails.organisation.companyName
    )

    // The organisation holds registrations across several sites, so the
    // Reprocessor tab groups them into one table per site rather than a
    // single list - the registration is found by its own number rather than
    // by a row position that a site table wouldn't keep stable.
    await page.getByRole('link', { name: 'View R26ER5000000002PA' }).click()

    expect(await registrationDetailsPage.headingText()).toContain(
      'Registration details'
    )

    // The page filters events by createdAt, so open the submission year.
    const submissionYear = new Date().getUTCFullYear()
    const periods = await registrationDetailsPage.registeredOnlyPeriods()
    const submittedRow =
      periods.findIndex((row) => row.get('Period') === String(submissionYear)) +
      1

    expect(submittedRow).toBeGreaterThan(0)

    await registrationDetailsPage.registeredOnlyActionLink(submittedRow).click()

    expect(await registeredOnlyPeriodPage.headingText()).toContain(
      `${submissionYear} Registered-only periods`
    )

    // Never accredited, so the whole year is registered-only time.
    await expect(registeredOnlyPeriodPage.noDataMessage()).toHaveCount(0)

    // Not the accreditation page's "Waste balance ledger" - this page's own
    // heading, so it is found by what it says rather than the shared page
    // object's heading reader, which looks for the other page's words.
    await expect(
      page.getByRole('heading', { name: 'Ledger', exact: true })
    ).toBeVisible()

    const ledgerEvents = await ledgerPage.eventRows()

    // No balance columns on this ledger - there is no accreditation to hold
    // a balance against.
    expect([...ledgerEvents[0].keys()]).toEqual([
      'Date',
      'Event',
      'Who',
      'Actions'
    ])

    const [submission] = ledgerEvents

    // The only event kind a registered-only ledger can hold - the backend
    // refuses PRN events without an accreditation.
    expect(submission.get('Event')).toBe('Summary log submitted')

    // No note to open without an accreditation.
    expect(submission.get('Actions')).toBe('')
    expect(submission.get('Who')).toContain('@')

    // A regulator reads and does not write.
    expect(await registeredOnlyPeriodPage.changeControlCount()).toBe(0)
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
