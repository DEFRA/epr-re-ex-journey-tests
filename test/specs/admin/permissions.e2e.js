import {
  createLinkedOrganisation,
  createSubmittedReport,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '~/test/support/apicalls.js'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/admin/home.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import { OrsUploadPage } from 'page-objects/admin/ors.upload.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { purgeDlq, sendMessageToDlq } from '~/test/support/sqs-helpers.js'
import { QueueManagementPage } from 'page-objects/admin/queue.management.page'

const users = [
  {
    username: 'niea@test.gov.uk',
    scopes: ['admin.read', 'admin.dlq.purge']
  },
  { username: 'nrw@test.gov.uk', scopes: ['admin.read'] }
]

users.forEach(({ username, scopes }) => {
  test.describe(`Permissions flow for a user with the following scopes ${scopes}`, () => {
    test.beforeEach(async ({ page }) => {
      const loginPage = new AdminLoginPage(page)
      await loginPage.loginAsServiceMaintainer(username)
    })

    test.afterEach(async ({ page }) => {
      const homePage = new HomePage(page)
      await homePage.signOut()
    })

    test('Should not be able to update an organisation @permissions @organisationpermissions', async ({
      page
    }) => {
      const navigation = new Navigation(page)
      const organisationsPage = new OrganisationsPage(page)
      const jsonEditor = new JsonEditor(page)

      const linkedOrganisation = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      const organisation = linkedOrganisation.organisation

      await navigation.clickOnLink('Organisations')

      await organisationsPage.searchFor(organisation.companyName)
      const searchResult = await organisationsPage.searchResult()
      expect(searchResult).toEqual('1 result found')

      await organisationsPage.editLink(1)

      const permissionsText = await organisationsPage.getPermissionText()
      expect(permissionsText).toContain(
        'You do not have permission to edit this organisation.'
      )

      const saveButtonExists = await jsonEditor.saveButtonExists()
      expect(saveButtonExists).toBeFalsy()
    })

    test('Should not be able to upload ORS file @permissions @orspermissions', async ({
      page
    }) => {
      const navigation = new Navigation(page)
      const orsUploadPage = new OrsUploadPage(page)

      await navigation.clickOnLink('Overseas sites')
      await orsUploadPage.open()

      const permissionsHeader = await orsUploadPage.permissionsErrorHeading()
      expect(permissionsHeader).toContain('You do not have permission')

      const permissionsText = await orsUploadPage.permissionsErrorText()
      expect(permissionsText).toContain(
        'Your account does not have permission to use this page. If you think this is wrong, contact your administrator.'
      )
    })

    test('Should not be able to unsubmit a report @permissions @unsubmitpermissions', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)
      const organisationOverviewPage = new OrganisationOverviewPage(page)
      const registrationOverviewPage = new RegistrationOverviewPage(page)

      const linkedOrganisation = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      const { organisation } = linkedOrganisation

      await updateMigratedOrganisation(linkedOrganisation.refNo, [
        {
          regNumber: FAKE_REGISTRATION_NUMBER,
          accNumber: FAKE_ACCREDITATION_NUMBER,
          status: 'approved',
          reprocessingType: 'input'
        }
      ])

      await createSubmittedReport(linkedOrganisation.refNo)

      await organisationsPage.open()
      await organisationsPage.searchFor(organisation.companyName)
      await organisationsPage.viewLink(1)

      await organisationOverviewPage.viewRegistrationLink(1)

      const unsubmitLinkExists =
        await registrationOverviewPage.unsubmitReportLinkExists(1)
      expect(unsubmitLinkExists).toBeFalsy()
    })
  })
})

test.describe('Permissions flow for a support user only', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer('nrw@test.gov.uk')
  })

  test.afterEach(async ({ page }) => {
    const homePage = new HomePage(page)
    await homePage.signOut()
  })

  const testMessage = {
    type: 'PROCESS_SUMMARY_LOG',
    payload: {
      summaryLogId: 'journey-test-dlq-001',
      description: 'Journey test DLQ message'
    }
  }

  test('Should not be able to purge the DLQ from the UI @permissions @dlqpermissions', async ({
    page
  }) => {
    const navigation = new Navigation(page)
    const queueManagementPage = new QueueManagementPage(page)

    await purgeDlq()
    await sendMessageToDlq(testMessage)

    await navigation.clickOnLink('Queue management')

    const clearAllMessagesButtonExists =
      await queueManagementPage.clearAllMessagesButtonExists()
    expect(clearAllMessagesButtonExists).toBeFalsy()
  })
})
