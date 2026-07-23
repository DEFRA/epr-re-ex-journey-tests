import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { checkBodyText, checkUploadErrorText } from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

// Split from summarylogs.unhappy.paths.e2e.js (PAE-1405 CI runtime work) so
// per-file worker scheduling can run these in parallel with
// summarylogs.unhappy.paths.cover-and-ors.e2e.js instead of serially in one
// file. This half covers template/structural rejection and per-cell
// validation errors.
test.describe('Summary Logs - Unhappy paths - Template and validation @unhappyPaths', () => {
  test('Should get an error message with an empty Summary Log spreadsheet @emptyMessage', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912PA',
          accNumber: 'ACC123888',
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.uploadFile('resources/empty.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkUploadErrorText(
      page,
      '#main-content > div > div:nth-child(2) > div > div > p.govuk-body.govuk-\\!-font-weight-bold',
      "The summary log template you're uploading is incorrect - make sure you download the correct template for your registration or accreditation",
      30
    )

    await uploadSummaryLogPage.continue()
    await checkUploadErrorText(
      page,
      '#main-content > div > div:nth-child(2) > div > div > p.govuk-body.govuk-\\!-font-weight-bold',
      "The summary log template you're uploading is incorrect - make sure you download the correct template for your registration or accreditation",
      30
    )

    await uploadSummaryLogPage.returnToSubmissionPage()
    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, 'R25SR5111050912PA', 10)
    await checkBodyText(page, 'ACC123888', 10)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('Should get an error message with a Summary Log spreadsheet that does not conform to template requirements @invalidTemplate', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.continue()
    await expect(page).toHaveTitle(/Summary log: upload/)

    // GOV.UK's Button component debounces preventDoubleClick for 1s from any
    // click on the button — including this one, blocked from submitting by
    // the file input's own `required` validation. The debounce timer starts
    // on the click itself, before constraint validation can cancel it, so a
    // second click inside that window is silently swallowed. Wait it out
    // rather than racing it (no DOM state exposes the debounce).
    await page.waitForTimeout(1200)

    await uploadSummaryLogPage.uploadFile('resources/bad-marker.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(
      page,
      "The summary log template you're uploading is incorrect - make sure you download the correct template for your registration or accreditation",
      60
    )

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('Should show per-cell validation error detail for each failing cell @summLogsValidationErrors', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber: 'E25SR500020912PA',
          accNumber: 'E-ACC12245PA',
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()

    await expect(page).toHaveTitle(/Summary log: upload/)

    await uploadSummaryLogPage.uploadFile('resources/exporter-invalid.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Your summary log cannot be uploaded', 60)

    await checkBodyText(page, 'errors in your summary log', 60)
    await checkBodyText(
      page,
      "You'll need to fix all of your summary log errors before you can upload this file.",
      30
    )

    const validationErrors = await uploadSummaryLogPage.getValidationErrors()
    const expectedErrors = [
      {
        rowId: '1000',
        section: 'Exported (sections 1, 2 and 3)',
        columnHeader: 'Date received for export',
        cell: 'G4',
        dataEntered: '????',
        errorMessage: 'Must be a valid date in the format dd/mm/yyyy'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Description of waste',
        cell: 'I4',
        dataEntered: 'WrongDesc',
        errorMessage: 'Select a value from the drop-down list'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Were PRN or PERN issued on this waste',
        cell: 'J4',
        dataEntered: 'Unknown',
        errorMessage: 'Must be Yes or No'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Gross weight',
        cell: 'K4',
        dataEntered: '1010',
        errorMessage: 'Must be 1,000 or less'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Tare weight',
        cell: 'L4',
        dataEntered: '-10',
        errorMessage: 'Must be 0 or more'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Pallet weight',
        cell: 'M4',
        dataEntered: '-50',
        errorMessage: 'Must be 0 or more'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Net weight',
        cell: 'N4',
        dataEntered: '-50',
        errorMessage: 'Must be 0 or more'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Bailing wire protocol',
        cell: 'O4',
        dataEntered: 'Invalid',
        errorMessage: 'Must be Yes or No'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'How did you calculate recyclable proportion',
        cell: 'P4',
        dataEntered: 'Invalid',
        errorMessage: 'Select a value from the drop-down list'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Weight of non-target materials',
        cell: 'Q4',
        dataEntered: '1005',
        errorMessage: 'Must be 1,000 or less'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Recyclable proportion percentage',
        cell: 'R4',
        dataEntered: '1.1',
        errorMessage: 'Must be 1 or less'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Tonnage received for export',
        cell: 'S4',
        dataEntered: '-1160.5',
        errorMessage: 'Must be 0 or more'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Tonnage of UK packaging waste exported',
        cell: 'T4',
        dataEntered: '1002',
        errorMessage: 'Must be 1,000 or less'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Date of export',
        cell: 'U4',
        dataEntered: 'TBC',
        errorMessage: 'Must be a valid date in the format dd/mm/yyyy'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Basel export code',
        cell: 'V4',
        dataEntered: 'NotABasel',
        errorMessage: 'Select a value from the drop-down list'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Customs codes',
        cell: 'W4',
        dataEntered:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890',
        errorMessage: 'Must be 100 characters or fewer'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Container number',
        cell: 'X4',
        dataEntered:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890',
        errorMessage: 'Must be 100 characters or fewer'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Date received by OSR',
        cell: 'Y4',
        dataEntered: '30-02-2025',
        errorMessage: 'Check this value'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'OSR ID',
        cell: 'Z4',
        dataEntered: '98A',
        errorMessage: 'Must be a 3-digit number'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Did waste pass through an interim site',
        cell: 'AA4',
        dataEntered: 'notValid',
        errorMessage: 'Must be Yes or No'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Tonnage passed to interim site received by OSR',
        cell: 'AC4',
        dataEntered: '-50',
        errorMessage: 'Must be 0 or more'
      },
      {
        rowId: '4000',
        section: 'Sent on (sections 4 and 5)',
        columnHeader: 'Date load left site',
        cell: 'G4',
        dataEntered: '???',
        errorMessage: 'Must be a valid date in the format dd/mm/yyyy'
      },
      {
        rowId: '',
        section: '',
        columnHeader: 'Tonnage of UK packaging waste sent on',
        cell: 'H4',
        dataEntered: 'ABC',
        errorMessage: 'Must be a number'
      }
    ]

    expect(validationErrors).toEqual(expectedErrors)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
