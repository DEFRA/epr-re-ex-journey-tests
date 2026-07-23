import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { UnlinkOrganisationConfirmationPage } from 'page-objects/admin/unlink.organisation.confirmation.page'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import {
  createLinkedOrganisation,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  getOrganisation,
  linkOrganisationToDefraId,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

test.describe('Unlink organisation from Defra ID', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('shows the linked Defra ID org, unlinks via the confirm page, and records a system log @organisations @unlink', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const unlinkOrganisationConfirmationPage =
      new UnlinkOrganisationConfirmationPage(page)
    const systemLogsPage = new SystemLogsPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    const { organisation, refNo } = linkedOrganisation

    await updateMigratedOrganisation(refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])
    const defraOrg = await linkOrganisationToDefraId(refNo, organisation.email)

    await organisationsPage.open()
    await organisationsPage.searchFor(organisation.companyName)
    expect(await organisationsPage.searchResult()).toEqual('1 result found')
    await organisationsPage.viewLink(1)
    expect(await organisationOverviewPage.getHeaderText()).toEqual(
      organisation.companyName
    )

    const linkText = await organisationOverviewPage.getDefraIdLinkText()
    expect(linkText).toContain(defraOrg.defraOrgName)
    expect(linkText).toContain(defraOrg.defraOrgId)

    const statusBeforeUnlink = (await getOrganisation(refNo)).status

    expect(await organisationOverviewPage.isUnlinkButtonDisplayed()).toBe(true)
    await organisationOverviewPage.clickUnlink()

    expect(await unlinkOrganisationConfirmationPage.getHeaderText()).toEqual(
      'Unlink organisation from Defra ID'
    )
    const bodyText = await unlinkOrganisationConfirmationPage.getBodyText()
    expect(bodyText).toContain(organisation.companyName)
    expect(bodyText).toContain(defraOrg.defraOrgName)

    await unlinkOrganisationConfirmationPage.confirmUnlink()

    expect(
      await organisationOverviewPage.getNotificationBannerText()
    ).toContain('Organisation unlinked from Defra ID')
    expect(
      await organisationOverviewPage.getNoLinkedOrganisationText()
    ).toContain('No linked organisation')

    const orgAfterUnlink = await getOrganisation(refNo)
    expect(orgAfterUnlink.linkedDefraOrganisation).toBeFalsy()
    expect(orgAfterUnlink.status).toEqual(statusBeforeUnlink)

    await systemLogsPage.open()

    // Poll-and-search: the log takes a moment to become searchable, so
    // re-search on each attempt rather than a single wait-then-read.
    let card = false
    const deadline = Date.now() + 15000
    while (!card) {
      await systemLogsPage.searchFor(refNo)
      card = (await systemLogsPage.unlinkLogCard()) ?? false
      if (card) break
      if (Date.now() > deadline) {
        throw new Error(`unlink system log did not appear for ${refNo}`)
      }
      await page.waitForTimeout(1000)
    }

    const contextText = await systemLogsPage.logCardField(card, 'Context')
    expect(contextText).toContain('organisationId')
    expect(contextText).toContain('unlinkedDefraOrganisation')
    expect(contextText).toContain(defraOrg.defraOrgId)
    expect(contextText).toContain(defraOrg.defraOrgName)

    const userEmail = await systemLogsPage.logCardField(card, 'User email')
    expect(userEmail).toBeTruthy()
  })

  test('leaves the organisation linked when the confirm page is cancelled @organisations @unlink', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const unlinkOrganisationConfirmationPage =
      new UnlinkOrganisationConfirmationPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    const { organisation, refNo } = linkedOrganisation

    await updateMigratedOrganisation(refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])
    await linkOrganisationToDefraId(refNo, organisation.email)

    await organisationsPage.open()
    await organisationsPage.searchFor(organisation.companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.clickUnlink()

    await unlinkOrganisationConfirmationPage.cancel()

    expect(await organisationOverviewPage.isUnlinkButtonDisplayed()).toBe(true)
    const orgAfterCancel = await getOrganisation(refNo)
    expect(orgAfterCancel.linkedDefraOrganisation).toBeTruthy()
  })
})
