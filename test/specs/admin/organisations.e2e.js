import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import {
  createLinkedOrganisation,
  fillerNumbers,
  updateMigratedOrganisation
} from '../../support/seeding/organisation.js'
import { generateNumbers } from '../../support/reg-acc-number.js'
import { createSubmittedReport } from '../../support/seeding/reports.js'
import { checkAccessibility } from '../../support/accessibility.js'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import { UnsubmitConfirmationPage } from 'page-objects/admin/unsubmit.confirmation.page'

// The Reg/Acc Numbers column shows one 'registration - accreditation' line per
// registration, joined by <br> - which innerText() reads back as a newline. A
// freshly applied organisation has a number on neither side of either line.
const UNNUMBERED_REG_ACC_PAIRS = 'None - None\nNone - None'

test.describe('Organisations page', () => {
  // Each test logs in independently (Playwright gives every test a fresh,
  // isolated browser context - unlike WDIO's single shared session per file,
  // login state doesn't carry over between tests).
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('Should be able to update an organisation and view system logs @organisations', async ({
    page
  }) => {
    const navigation = new Navigation(page)
    const organisationsPage = new OrganisationsPage(page)
    const jsonEditor = new JsonEditor(page)
    const systemLogsPage = new SystemLogsPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const organisation = linkedOrganisation.organisation

    await navigation.clickOnLink('Organisations')

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: UNNUMBERED_REG_ACC_PAIRS,
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    const updatedOrgId = linkedOrganisation.orgId + 100000

    await organisationsPage.editLink(1)

    await jsonEditor.switchToTextEditor()
    const actualOrgValue = await jsonEditor.getEditorTextValue()
    expect(actualOrgValue).toContain(organisation.email)
    await jsonEditor.switchToTreeEditor()
    await jsonEditor.updateOrgId(updatedOrgId)
    await jsonEditor.saveButton().click()

    const successMessage = await organisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')

    await navigation.clickOnLink('Organisations')

    await organisationsPage.searchFor(organisation.companyName)
    const updatedSearchResult = await organisationsPage.searchResult()
    expect(updatedSearchResult).toEqual('1 result found')

    const updatedSearchOrgTable = await organisationsPage.getTableData()
    const expectedUpdatedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${updatedOrgId}`,
        regAccNumbers: UNNUMBERED_REG_ACC_PAIRS,
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(updatedSearchOrgTable).toEqual(expectedUpdatedSearchOrgTable)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    const searchResults = await systemLogsPage.searchResults()
    await expect(searchResults).toBeAttached()

    const actualJsonDifference = await systemLogsPage.jsonDifference()
    const expectedJsonDifference = {
      version: {
        _changed: '1 -> 2'
      },
      orgId: {
        _changed: `${linkedOrganisation.orgId} -> ${updatedOrgId}`
      },
      users: {
        0: {
          _added: {
            fullName: `${organisation.fullName}`,
            email: `${organisation.email}`,
            roles: ['initial_user', 'standard_user']
          }
        }
      }
    }
    expect(JSON.parse(actualJsonDifference)).toEqual(expectedJsonDifference)
  })

  test('Should be able to view an organisation overview and drill down to a registration overview @organisations', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const reprocessorNumbers = fillerNumbers()
    const exporterNumbers = generateNumbers({
      wasteProcessingType: 'exporter',
      materialSuffix: 'PA'
    })

    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      { ...reprocessorNumbers, status: 'approved', reprocessingType: 'input' },
      { ...exporterNumbers, status: 'approved' }
    ])

    const { organisation, registrations } = linkedOrganisation

    await organisationsPage.open()

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: `${reprocessorNumbers.regNumber} - ${reprocessorNumbers.accNumber}\n${exporterNumbers.regNumber} - ${exporterNumbers.accNumber}`,
        regulator: 'EA',
        status: 'approved'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await organisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await organisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)

    // Sorted by registration number: a reprocessor's (R..ER..) before an exporter's (R..EX..)
    const registrationsData =
      await organisationOverviewPage.getRegistrationsTableData()
    const expectedRegistrationsData = [
      {
        registrationNumber: reprocessorNumbers.regNumber,
        registrationStatus: 'approved',
        processingType: 'reprocessor - input',
        material: 'paper',
        site: registrations[0].streetAddress,
        accreditationNumber: reprocessorNumbers.accNumber,
        accreditationStatus: 'approved'
      },
      {
        registrationNumber: exporterNumbers.regNumber,
        registrationStatus: 'approved',
        processingType: 'exporter',
        material: 'paper',
        site: '',
        accreditationNumber: exporterNumbers.accNumber,
        accreditationStatus: 'approved'
      }
    ]
    expect(registrationsData).toEqual(expectedRegistrationsData)

    await organisationOverviewPage.viewRegistrationLink(1)

    // registration overview page
    const registrationOverviewPageHeader =
      await registrationOverviewPage.getHeaderText()
    expect(registrationOverviewPageHeader).toEqual(
      `${organisation.companyName} - ${reprocessorNumbers.regNumber}`
    )

    await expect(registrationOverviewPage.reportsTable()).toBeVisible()

    const summaryLogContent =
      await registrationOverviewPage.getSummaryLogsContent()
    expect(summaryLogContent).toContain('No summary logs')
  })

  test('Should be able to view an organisation overview and unsubmit a report @organisations @unsubmit', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const unsubmitConfirmationPage = new UnsubmitConfirmationPage(page)

    await checkAccessibility(page, 'Home')

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const { regNumber, accNumber } = fillerNumbers()

    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber,
        accNumber,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    const { organisation } = linkedOrganisation

    await createSubmittedReport(linkedOrganisation.refNo)

    await organisationsPage.open()
    await checkAccessibility(page, 'Organisations')

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: `${regNumber} - ${accNumber}`,
        regulator: 'EA',
        status: 'active'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await organisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await organisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)
    await checkAccessibility(page, 'Organisation overview')

    await organisationOverviewPage.viewRegistrationLink(1)

    let reportsData = await registrationOverviewPage.getReportsTableData()
    const lastRowIdx = reportsData.length - 1
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('Submitted')
    expect(reportsData[lastRowIdx].actions).toContain('View')
    expect(reportsData[lastRowIdx].actions).toContain('Unsubmit')
    await checkAccessibility(page, 'Registration overview')

    // unsubmit report
    await registrationOverviewPage.clickOnUnsubmitReportLink(lastRowIdx + 1)
    const warningText = await unsubmitConfirmationPage.getWarningText()
    expect(warningText).toContain(
      "Unsubmitting will move the report back to 'ready to submit'. The operator will need to delete and resubmit it."
    )
    await checkAccessibility(page, 'Confirm unsubmit report')
    await unsubmitConfirmationPage.confirmUnsubmitButton().click()

    const successMessage = await unsubmitConfirmationPage.getSuccessMessage()
    expect(successMessage).toEqual('Report unsubmitted')

    await unsubmitConfirmationPage.returnToRegistrationOverviewLink().click()

    reportsData = await registrationOverviewPage.getReportsTableData()
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('Ready to submit')
    expect(reportsData[lastRowIdx].actions).not.toContain('Unsubmit')
  })
})
