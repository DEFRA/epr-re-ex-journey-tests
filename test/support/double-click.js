import { expect } from '@playwright/test'

export async function checkDoubleClickPrevented(
  page,
  selector,
  { waitForNavigation = true } = {}
) {
  const btn = page.locator(selector)
  await btn.waitFor({ state: 'visible', timeout: 5000 })
  await page.evaluate(() => {
    window.__submitCount = 0
    document.querySelector('form')?.addEventListener('submit', (e) => {
      window.__submitCount++
      e.preventDefault()
    })
  })
  await btn.click()
  await btn.click()
  expect(await page.evaluate(() => window.__submitCount)).toBe(1)
  const currentUrl = page.url()
  await page.evaluate(() => document.querySelector('form')?.submit())
  if (waitForNavigation) {
    await page.waitForURL((url) => url.toString() !== currentUrl, {
      timeout: 10000
    })
  }
}
