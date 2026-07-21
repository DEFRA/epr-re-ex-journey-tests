import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import QueueManagementPage from 'page-objects/admin/queue.management.page'
import { sendMessageToDlq, purgeDlq } from '../../support/sqs-helpers.js'

const testMessage = {
  type: 'PROCESS_SUMMARY_LOG',
  payload: {
    summaryLogId: 'journey-test-dlq-001',
    description: 'Journey test DLQ message'
  }
}

describe('Queue management page', () => {
  it('Should display DLQ messages and clear them @queuemanagement', async () => {
    // Seed: ensure clean DLQ then send a test message
    await purgeDlq()
    await sendMessageToDlq(testMessage)

    // Log in
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    // Navigate to queue management
    await Navigation.clickOnLink('Queue management')

    const headerText = await QueueManagementPage.getHeaderText()
    expect(headerText).toBe('Queue management')

    // Verify messages table columns
    const headers = await QueueManagementPage.getTableHeaders()
    expect(headers).toEqual([
      'Command type',
      'Sent timestamp',
      'Receive count',
      'Raw message'
    ])

    // Verify the seeded message appears
    const row = await QueueManagementPage.getFirstRowData()
    expect(row.commandType).toBe('PROCESS_SUMMARY_LOG')

    // Expand and verify raw message body
    await QueueManagementPage.expandRawMessage()
    const rawBody = await QueueManagementPage.getRawMessageBody()
    expect(rawBody).toContain('"type": "PROCESS_SUMMARY_LOG"')

    // Clear all messages flow
    await QueueManagementPage.clickClearAllMessages()

    const confirmHeading = await QueueManagementPage.getConfirmHeading()
    expect(confirmHeading).toBe('Confirm clear all messages')

    await QueueManagementPage.confirmClear()

    // Verify success banner and empty state
    const bannerText = await QueueManagementPage.getSuccessBannerText()
    expect(bannerText).toContain(
      'All dead-letter queue messages have been cleared.'
    )

    const emptyState = await QueueManagementPage.getEmptyStateText()
    expect(emptyState).toContain('no messages on the dead-letter queue')
  })
})
