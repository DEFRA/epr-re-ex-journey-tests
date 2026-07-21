import { $, browser, expect } from '@wdio/globals'

export async function checkDoubleClickPrevented(
  selector,
  { waitForNavigation = true } = {}
) {
  const btn = $(selector)
  await btn.waitForClickable({ timeout: 5000 })
  await browser.execute(() => {
    window.__submitCount = 0
    document.querySelector('form')?.addEventListener('submit', (e) => {
      window.__submitCount++
      e.preventDefault()
    })
  })
  await btn.click()
  await btn.click()
  expect(await browser.execute(() => window.__submitCount)).toBe(1)
  const currentUrl = await browser.getUrl()
  await browser.execute(() => document.querySelector('form')?.submit())
  if (waitForNavigation) {
    await browser.waitUntil(
      async () => (await browser.getUrl()) !== currentUrl,
      { timeout: 10000 }
    )
  }
}
