import { $, $$, expect } from '@wdio/globals'

import HomePage from 'page-objects/admin/home.page'
import JsonEditor from 'page-objects/admin/jsoneditor.page'
import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import SystemLogsPage from 'page-objects/admin/system.logs.page'
import { createLinkedOrganisation } from '../../support/apicalls.js'

describe('System logs search @searchsystemlogs', () => {
  let linkedOrganisation

  before(async () => {
    linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    await LoginPage.loginAsServiceMaintainer()

    const headerText = await HomePage.getWelcomeText()
    expect(headerText).toEqual('Welcome EA Regulator!')

    await Navigation.clickOnLink('Organisations')
    await OrganisationsPage.searchFor(
      linkedOrganisation.organisation.companyName
    )
    expect(await OrganisationsPage.searchResult()).toEqual('1 result found')
    await OrganisationsPage.editLink(1)
    await JsonEditor.switchToTreeEditor()
    await JsonEditor.updateOrgId(Number(linkedOrganisation.orgId) + 100000)
    await JsonEditor.saveChanges()

    const successMessage = await OrganisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')
  })

  it('finds system logs by organisation reference number', async () => {
    await Navigation.clickOnLink('System logs')

    await SystemLogsPage.searchFor(linkedOrganisation.refNo)
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize({ gte: 1 })
  })

  it('finds system logs by user ID', async () => {
    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await SystemLogsPage.firstResultUserId()

    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchByUserId(userId)
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize({ gte: 1 })
  })

  it('shows no results when user ID matches no logs', async () => {
    await Navigation.clickOnLink('System logs')

    await SystemLogsPage.searchByUserId('no-such-user-id')
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize(0)
  })

  it('filters by event type alongside user ID', async () => {
    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await SystemLogsPage.firstResultUserId()

    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchByUserIdAndEventType(userId, 'epr-organisations')
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize({ gte: 1 })
  })

  it('clears search and resets the form', async () => {
    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await SystemLogsPage.firstResultUserId()

    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchByAllFilters(
      linkedOrganisation.refNo,
      userId,
      'epr-organisations'
    )
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize({ gte: 1 })

    await SystemLogsPage.clearSearch()

    expect(await SystemLogsPage.referenceNumberValue()).toBe('')
    expect(await SystemLogsPage.userIdValue()).toBe('')
    expect(await SystemLogsPage.eventTypeValue()).toBe('')
    await expect(
      $$('#main-content div.govuk-summary-card')
    ).toBeElementsArrayOfSize(0)
  })

  it('shows error when submitting with no filters', async () => {
    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.submitSearch()

    await expect($('.govuk-error-summary')).toHaveText(
      expect.stringContaining(
        'Enter an organisation reference number, user ID or event type'
      )
    )
  })
})
