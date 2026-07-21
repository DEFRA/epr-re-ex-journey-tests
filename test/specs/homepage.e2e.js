import HomePage from '../page-objects/homepage.js'

import { browser, expect } from '@wdio/globals'

describe('EPR Homepage', () => {
  // TODO: Re-enable when Welsh translations are available (PAE-793)
  it.skip('Should be able to navigate to Home Page via Welsh and redirect from /cy to /cy/start', async () => {
    await HomePage.open('/cy')
    const lang = await browser.$('html').getAttribute('lang')
    expect(lang).toBe('cy')
    await expect(browser).toHaveTitle(expect.stringContaining('Hafan'))
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/cy/start'),
      {
        timeout: 5000,
        timeoutMsg: 'Expected URL to redirect to /cy/start'
      }
    )
    const url = await browser.getUrl()
    expect(url).toContain('/cy/start')
  })
})
