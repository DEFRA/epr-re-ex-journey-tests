class DefraIdStubPage {
  constructor(page) {
    this.page = page
  }

  async loginViaEmail(email) {
    await this.page.locator('#email').fill(email)

    // Triggers a navigation via `click` and waits for the browser URL to
    // actually change before returning. Needed for the OAuth login flow: the
    // click kicks off a redirect chain (stub → app callback → dashboard),
    // and the session cookie is only set once the chain has settled. A
    // caller that navigates next can otherwise race the chain and hit the
    // app as unauthenticated, which redirects to /logged-out and leaves the
    // test staring at the wrong page - reproduced consistently for a caller
    // that does an immediate page.goto right after login. Waiting for
    // network idle too gives any still-in-flight background auth/callback
    // request a chance to settle before control returns.
    const urlBeforeClick = this.page.url()
    await this.page.locator('button[type=submit]').click()
    await this.page.waitForURL((url) => url.toString() !== urlBeforeClick, {
      timeout: 15000
    })
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })
  }
}

export { DefraIdStubPage }
