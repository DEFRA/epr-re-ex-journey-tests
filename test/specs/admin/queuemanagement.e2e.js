import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { QueueManagementPage } from 'page-objects/admin/queue.management.page'
import { sendMessageToDlq, purgeDlq } from '../../support/sqs-helpers.js'

const testMessage = {
  type: 'PROCESS_SUMMARY_LOG',
  payload: {
    summaryLogId: 'journey-test-dlq-001',
    description: 'Journey test DLQ message'
  }
}

test.describe('Queue management page', () => {
  test('Should display DLQ messages and clear them @queuemanagement', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const queueManagementPage = new QueueManagementPage(page)

    // Seed: ensure clean DLQ then send a test message
    await purgeDlq()
    await sendMessageToDlq(testMessage)

    // Log in
    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    // Navigate to queue management
    await navigation.clickOnLink('Queue management')

    const headerText = await queueManagementPage.getHeaderText()
    expect(headerText).toBe('Queue management')

    // Verify messages table columns
    const headers = await queueManagementPage.getTableHeaders()
    expect(headers).toEqual([
      'Command type',
      'Sent timestamp',
      'Receive count',
      'Raw message'
    ])

    // Verify the seeded message appears
    const row = await queueManagementPage.getFirstRowData()
    expect(row.commandType).toBe('PROCESS_SUMMARY_LOG')

    // Expand and verify raw message body
    await queueManagementPage.expandRawMessage()
    const rawBody = await queueManagementPage.getRawMessageBody()
    expect(rawBody).toContain('"type": "PROCESS_SUMMARY_LOG"')

    // Clear all messages flow
    await queueManagementPage.clickClearAllMessages()

    const confirmHeading = await queueManagementPage.getConfirmHeading()
    expect(confirmHeading).toBe('Confirm clear all messages')

    await queueManagementPage.confirmClear()

    // Verify success banner and empty state
    const bannerText = await queueManagementPage.getSuccessBannerText()
    expect(bannerText).toContain(
      'All dead-letter queue messages have been cleared.'
    )

    const emptyState = await queueManagementPage.getEmptyStateText()
    expect(emptyState).toContain('no messages on the dead-letter queue')
  })
})
