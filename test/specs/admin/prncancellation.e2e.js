import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { PrnActivityPage } from 'page-objects/admin/prn.activity.page'
import { PrnCancelConfirmationPage } from 'page-objects/admin/prn.cancel.confirmation.page'
import { seedAdminActivityData } from '../../support/admin-activity-seed.js'

test.describe('Cancel an accepted PRN from the admin UI', () => {
  test('issues, accepts and cancels a PRN, crediting the balance back @prnactivity @prncancellation', async ({
    page
  }) => {
    const seeded = await seedAdminActivityData()

    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const prnActivityPage = new PrnActivityPage(page)
    const prnCancelConfirmationPage = new PrnCancelConfirmationPage(page)

    await loginPage.open()
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('PRN activity')

    const tableTextBeforeCancel = await prnActivityPage.tableText()
    expect(tableTextBeforeCancel).toContain(seeded.prnNumber)
    expect(tableTextBeforeCancel).toContain('accepted')

    await expect(prnActivityPage.cancelLink(seeded.prnNumber)).toBeVisible()
    await prnActivityPage.cancelLink(seeded.prnNumber).click()

    const detailsText = await prnCancelConfirmationPage.getDetailsText()
    expect(detailsText).toContain(seeded.prnNumber)
    expect(detailsText).toContain(String(seeded.tonnage))

    await prnCancelConfirmationPage.confirmCancel()

    expect(await prnCancelConfirmationPage.getPanelTitle()).toEqual(
      'PRN cancelled'
    )

    await prnActivityPage.open()
    const tableTextAfterCancel = await prnActivityPage.tableText()
    expect(tableTextAfterCancel).toContain(seeded.prnNumber)
    expect(tableTextAfterCancel).toContain('cancelled')
  })
})
