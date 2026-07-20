import { $$, browser } from '@wdio/globals'

class Navigation {
  async clickOnLink(linkText) {
    await browser.waitUntil(
      async () => {
        const elements = await $$('#navigation li a')
        return (await elements.length) > 0
      },
      {
        timeout: 5000,
        timeoutMsg: 'Expected to find navigation items'
      }
    )
    const links = await $$('#navigation li a').getElements()
    const targetLink = await links.find(async (el) => {
      const text = await el.getText()
      return text === linkText
    })
    await targetLink.click()
  }
}

export default new Navigation()
