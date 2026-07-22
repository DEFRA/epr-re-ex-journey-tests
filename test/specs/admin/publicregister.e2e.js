import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import PublicRegisterPage from 'page-objects/admin/public.register.page'
import {
  createLinkedOrganisation,
  createSubmittedReport,
  updateMigratedOrganisation
} from '../../support/apicalls.js'
import { parseCsvRows } from '../../support/csv.js'

// Matches the fixed abbreviation list the backend's compliance-reporting-periods
// uses to build the CSV's dynamic "<Mon> Report" column headers.
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

describe('Public Register page', () => {
  const regNumber = 'R25SR500030912PA'
  const accNumber = 'ACC123456'
  let orgId
  let orgName
  let report

  before(async () => {
    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    orgId = linkedOrganisation.orgId
    orgName = linkedOrganisation.organisation.companyName

    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        reprocessingType: 'input',
        regNumber,
        accNumber,
        status: 'approved'
      }
    ])

    report = await createSubmittedReport(linkedOrganisation.refNo)
  })

  it('Should be able to view Public Register if logged in @publicregister', async () => {
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    await Navigation.clickOnLink('Public register')
    expect(
      await PublicRegisterPage.downloadPublicRegisterButtonExistence()
    ).toBe(true)
    await PublicRegisterPage.downloadPublicRegister()

    const csv = await PublicRegisterPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('public-register')
    expect(csv.body).toContain(orgName)

    const firstLine = csv.body.replace(/^\uFEFF/, '').split(/\r?\n/)[0]
    expect(firstLine).toMatch(/^Generated at \d{2}\.\d{2}\.\d{2} \d{2}:\d{2}/)

    const orgRow = parseCsvRows(csv.body, 'Type,').findLast(
      (row) => row['Org ID'] === String(orgId)
    )
    expect(orgRow).toBeDefined()
    if (!orgRow) {
      throw new Error('Organisation row not found in public register CSV')
    }

    expect(orgRow.Type).toEqual('Reprocessor')
    expect(orgRow['Registration number']).toEqual(regNumber)
    expect(orgRow['Packaging Waste Category']).toEqual('Paper and board')
    expect(orgRow['Annex II Process']).toEqual('R3')
    expect(orgRow['Accreditation No']).toEqual(accNumber)
    expect(orgRow['Accreditation status']).toEqual('Approved')

    const reportColumn =
      report.cadence === 'monthly'
        ? `${MONTH_ABBR[report.period - 1]} Report`
        : `Q${report.period} Report`
    expect(orgRow[reportColumn]).toBeTruthy()
    expect(orgRow[reportColumn]).not.toEqual('N/A')
  })
})
