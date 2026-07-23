import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'

test.describe('EPR Homepage', () => {
  // TODO: Re-enable when Welsh translations are available (PAE-793)
  test.skip('Should be able to navigate to Home Page via Welsh and redirect from /cy to /cy/start', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    await homePage.open('/cy')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('cy')
    await expect(page).toHaveTitle(/Hafan/)
    await page.waitForURL((url) => url.toString().includes('/cy/start'), {
      timeout: 5000
    })
    const url = page.url()
    expect(url).toContain('/cy/start')
  })
})
