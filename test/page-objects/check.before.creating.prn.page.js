/// <reference types="@wdio/globals/types" />
import { browser, $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class CheckBeforeCreatingPRNPage extends Page {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await browser.waitUntil(
      async () => (await element.getText()).includes('Check before'),
      { timeout: 10000 }
    )
    return await element.getText()
  }

  async createPRN() {
    await $('#main-content button[type=submit]').click()
  }

  async discardAndStartAgain() {
    await $('a=Discard and start again').click()
  }
}

export default new CheckBeforeCreatingPRNPage()
