import { test, expect } from '@playwright/test'

import { RegulatorStartPage } from 'page-objects/regulator/start.page'

// The header carries the phase banner and the service navigation, which every
// page renders. It holds nothing that changes between runs, so it needs no
// masking and no seeded data - only a signed-in session to show the navigation.
//
// Baselines are rendered in the Playwright image pinned in the Dockerfile.
// Regenerate them there, never on a laptop: fonts and anti-aliasing differ.
test.describe('Page shell visual baseline @visual', () => {
  test.describe('on a narrow screen', () => {
    test.use({ viewport: { width: 375, height: 800 } })

    test('Should keep the header looking the same, menu closed and open', async ({
      page
    }) => {
      await new RegulatorStartPage(page).loginAsRegulator()
      await expect(page).toHaveURL(/\/regulators\/home/)
      const header = page.getByRole('banner')

      await expect(header).toHaveScreenshot('header-narrow-closed.png')
      await expect(header).toMatchAriaSnapshot({
        name: 'header-narrow-closed.aria.yml'
      })

      await page.getByRole('button', { name: 'Menu' }).click()

      await expect(header).toHaveScreenshot('header-narrow-open.png')
      await expect(header).toMatchAriaSnapshot({
        name: 'header-narrow-open.aria.yml'
      })
    })
  })

  test.describe('on a wide screen', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('Should keep the header looking the same', async ({ page }) => {
      await new RegulatorStartPage(page).loginAsRegulator()
      await expect(page).toHaveURL(/\/regulators\/home/)
      const header = page.getByRole('banner')

      await expect(header).toHaveScreenshot('header-wide.png')
      await expect(header).toMatchAriaSnapshot({ name: 'header-wide.aria.yml' })
    })
  })
})
