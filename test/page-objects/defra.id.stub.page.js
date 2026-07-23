import { expect } from '@playwright/test'

class DefraIdStubPage {
  constructor(page) {
    this.page = page
  }

  async loginViaEmail(email) {
    const selector = `//tr[th[translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")="${email.toLowerCase()}"]]//a`
    // The matched row has both a "Log in" and an "Expire" link; WDIO's $()
    // silently took the first match, so pin that same behaviour explicitly -
    // Playwright's locator throws in strict mode on more than one match.
    const link = this.page.locator(selector).first()

    // The stub's user list is populated by backend seeding that can lag the
    // page load, so poll-and-reload until the row appears rather than
    // relying on Playwright's client-side auto-waiting alone.
    await expect
      .poll(
        async () => {
          if (await link.count()) {
            return true
          }
          await this.page.reload()
          return false
        },
        { timeout: 15000, intervals: [2000] }
      )
      .toBe(true)

    // Triggers a navigation via `click` and waits for the browser URL to
    // actually change before returning. Needed for the OAuth login flow: the
    // click kicks off a redirect chain (stub login page → stub org picker
    // and/or app callback → dashboard), and the session cookie is only set
    // once the chain has settled. A caller that navigates next can otherwise
    // race the chain and hit the app as unauthenticated, which redirects to
    // /logged-out and leaves the test staring at the wrong page.
    //
    // The URL settling isn't quite the full story though: epr-frontend fires
    // a second, asynchronous auth/callback?...&refresh=1 request alongside
    // the main navigation (visible in the network trace as two near-
    // simultaneous requests for the same one-time code). If a caller's next
    // action fires the instant the URL changes, it can race ahead of that
    // still-in-flight background request and get treated as unauthenticated
    // (redirected to /logged-out) before the session is actually finalised -
    // reproduced consistently for a caller that does an immediate page.goto
    // right after login. Waiting for network idle too gives that background
    // call a chance to settle before control returns.
    const urlBeforeClick = this.page.url()
    await link.click()
    await this.page.waitForURL((url) => url.toString() !== urlBeforeClick, {
      timeout: 15000
    })
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })
  }
}

export { DefraIdStubPage }
