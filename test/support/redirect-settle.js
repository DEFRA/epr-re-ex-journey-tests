/**
 * Clicks whatever button/link kicks off a redirect chain (identity provider
 * -> app callback -> landing page) and waits for it to settle: the browser
 * URL to actually change, and the network to go idle. Shared by every
 * external sign-in form this suite drives (real Entra, real GOV.UK One
 * Login) - a caller that acts immediately after the click can otherwise
 * race the chain, reproduced consistently for a caller that does an
 * immediate page.goto right after login.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} triggerRedirect
 */
export async function clickAndAwaitRedirectChain(page, triggerRedirect) {
  const urlBeforeClick = page.url()
  await triggerRedirect()
  await page.waitForURL((url) => url.toString() !== urlBeforeClick, {
    timeout: 15000
  })
  await page.waitForLoadState('networkidle', { timeout: 15000 })
}
