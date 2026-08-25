import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { PrnActivityPage } from 'page-objects/admin/prn.activity.page'
import { PrnCancelConfirmationPage } from 'page-objects/admin/prn.cancel.confirmation.page'
import { seedAdminActivityData } from '../../support/admin-activity-seed.js'
import { externalAPICancelPrn } from '../../support/apicalls.js'

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

test.describe('Cancel an awaiting acceptance PRN from the admin UI (PAE-1859)', () => {
  test('issues but does not accept, then cancels a PRN, crediting the balance back @prnactivity @prncancellation', async ({
    page
  }) => {
    const seeded = await seedAdminActivityData({ acceptPrn: false })

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
    expect(tableTextBeforeCancel).toContain('awaiting acceptance')

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

  test('does not offer Cancel for a PRN the recipient has already rejected (awaiting_cancellation) @prnactivity @prncancellation', async ({
    page
  }) => {
    const seeded = await seedAdminActivityData({ acceptPrn: false })
    // Recipient-driven reject: awaiting_acceptance -> awaiting_cancellation.
    // Out of scope for admin cancellation (AC Scenario 4) — the RE/EX already
    // has a way out via the signatory once the recipient has rejected it.
    await externalAPICancelPrn({ prnNumber: seeded.prnNumber })

    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const prnActivityPage = new PrnActivityPage(page)

    await loginPage.open()
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('PRN activity')

    const tableText = await prnActivityPage.tableText()
    expect(tableText).toContain(seeded.prnNumber)
    expect(tableText).toContain('awaiting cancellation')

    await expect(prnActivityPage.cancelLink(seeded.prnNumber)).toHaveCount(0)
  })
})
