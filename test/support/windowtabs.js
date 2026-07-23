import { expect } from '@playwright/test'

/**
 * Waits for a new tab (opened via target=_blank) to appear in the given
 * page's browser context and returns it. Unlike the WDIO original, Playwright
 * has no implicit "current tab" — callers must use the returned Page
 * explicitly for any interaction with the new tab.
 * @param {import('@playwright/test').Page} page
 */
export async function switchToNewTab(page) {
  const context = page.context()

  await expect
    .poll(() => context.pages().length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2)

  const pages = context.pages()
  const newTab = pages[pages.length - 1]
  await newTab.waitForLoadState()
  return newTab
}

/**
 * Closes the tab opened via switchToNewTab. There's nothing to "switch back
 * to" under Playwright - the caller's original Page reference is unaffected
 * by opening/closing other tabs in the same context.
 * @param {import('@playwright/test').Page} tab
 */
export async function closeCurrentTabAndReturn(tab) {
  await tab.close()
}

/**
 * Waits for a new tab (opened via target=_blank), closes the original tab,
 * and returns the new tab's Page for the caller to use from here on.
 * @param {import('@playwright/test').Page} page
 */
export async function switchToNewTabAndClosePreviousTab(page) {
  const newTab = await switchToNewTab(page)
  await page.close()
  return newTab
}
