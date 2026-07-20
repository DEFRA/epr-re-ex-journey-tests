import { browser, expect } from '@wdio/globals'

/** @typedef {{ status: number, contentType: string | null, contentDisposition: string | null, body: string }} CsvResponse */

import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  createSubmittedReport
} from '../../support/apicalls.js'
import { parseCsvRows } from '../../support/csv.js'
import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import ReportSubmissionsPage from 'page-objects/admin/report.submissions.page'

describe('Report Submissions page', () => {
  let orgName

  before(async () => {
    const { refNo, organisation } = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    orgName = organisation.companyName

    await updateMigratedOrganisation(refNo, [
      {
        regNumber: 'REPROCESS-001',
        accNumber: 'ACC-001',
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    await createSubmittedReport(refNo)
  })

  it('Should be able to download Report Submissions if logged in @reportsubmissions', async () => {
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    await Navigation.clickOnLink('Report submissions')

    const csv = /** @type {CsvResponse} */ (
      /** @type {unknown} */ (await ReportSubmissionsPage.fetchCsv())
    )
    await expect(csv.status).toEqual(200)
    await expect(csv.contentType).toContain('text/csv')
    await expect(csv.contentDisposition).toContain('attachment')
    await expect(csv.body).toContain('Organisation name')
    await expect(csv.body).toContain('Tonnage received for recycling')
    await expect(csv.body).toContain(orgName)

    const orgRow = parseCsvRows(csv.body).findLast(
      (row) => row['Organisation name'] === orgName
    )
    await expect(orgRow).toBeDefined()
    if (!orgRow) {
      throw new Error('Organisation row not found')
    }
    await expect(orgRow['Submitted Date']).toBeTruthy()
    await expect(orgRow['Submitted By']).toBeTruthy()
    await expect(orgRow['Tonnage recycled']).toBeTruthy()
  })

  it('should include all expected column headers in the CSV download @reportsubmissions', async () => {
    await Navigation.clickOnLink('Report submissions')

    const csv = /** @type {CsvResponse} */ (
      /** @type {unknown} */ (await ReportSubmissionsPage.fetchCsv())
    )
    await expect(csv.status).toEqual(200)

    const rows = csv.body
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    const headerIndex = rows.findIndex((row) => row.startsWith('Regulator,'))
    await expect(headerIndex).toBeGreaterThanOrEqual(0)

    const headerRow = rows[headerIndex]
    const expectedHeaders = [
      'Regulator',
      'Organisation name',
      'Organisation registered approver contact number',
      'Organisation registered approver person email address',
      'Organisation registered submitter contact number',
      'Organisation registered submitter email address',
      'Material',
      'Accreditation No',
      'Registered No',
      'Report Type',
      'Report Period',
      'Due Date',
      'Submitted Date',
      'Submitted By',
      'Tonnage received for recycling',
      'Tonnage recycled',
      'Tonnage exported for recycling',
      'Tonnage sent on, total',
      'Tonnage sent on to a reprocessor',
      'Tonnage sent on to an exporter',
      'Tonnage sent on to other facilities',
      'Tonnage of PRNs/PERNs issued',
      'Self-issued (free) tonnage',
      'Total revenue from PRNs/PERNs',
      'Average PRN/PERN price per tonne',
      'Tonnage received but not recycled',
      'Tonnage received but not exported',
      'Tonnage exported that was stopped',
      'Tonnage exported that was refused',
      'Tonnage repatriated',
      'Note to regulator'
    ]

    for (const header of expectedHeaders) {
      await expect(headerRow).toContain(header)
    }
  })
})
