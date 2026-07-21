import { browser, $ } from '@wdio/globals'

// Triggers a navigation via `click` and waits for the browser URL to
// actually change before returning. Needed for the OAuth login flow: the
// click kicks off a redirect chain (stub login page → stub org picker
// and/or app callback → dashboard), and the session cookie is only set
// once the chain has settled. A caller that issues browser.url(...) next
// can otherwise race the chain and hit the app as unauthenticated, which
// redirects to /logged-out and leaves the test staring at the wrong page.
async function clickAndWaitForNavigation(click, timeoutMsg) {
  const urlBeforeClick = await browser.getUrl()
  await click()
  await browser.waitUntil(
    async () => (await browser.getUrl()) !== urlBeforeClick,
    { timeout: 15000, timeoutMsg }
  )
}

class DefraIdStubPage {
  async loginViaEmail(email) {
    const selector = `//tr[th[translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")="${email.toLowerCase()}"]]//a`
    await browser.waitUntil(
      async () => {
        const el = await $(selector)
        if (await el.isExisting()) {
          return true
        }
        await browser.refresh()
        return false
      },
      { timeout: 15000, interval: 2000 }
    )
    await clickAndWaitForNavigation(
      () => $(selector).click(),
      'Login click did not trigger navigation'
    )
  }
}

export default new DefraIdStubPage()
