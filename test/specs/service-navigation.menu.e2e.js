import { test, expect } from '@playwright/test'

import { RegulatorStartPage } from 'page-objects/regulator/start.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'

/**
 * @import { Page } from '@playwright/test'
 */

/**
 * @param {Page} page
 */
const signInToANavigationThatCollapses = async (page) => {
  await new RegulatorStartPage(page).loginAsRegulator()

  return new ServiceNavigation(page)
}

test.describe('Service navigation menu @regulator @serviceNavigationMenu', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('Should offer a menu button on a narrow screen that opens and closes the navigation', async ({
    page
  }) => {
    const serviceNavigation = await signInToANavigationThatCollapses(page)

    await expect(serviceNavigation.menuButton()).toBeVisible()
    await expect(serviceNavigation.menuButton()).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await expect(serviceNavigation.menu()).toBeHidden()

    await serviceNavigation.menuButton().click()

    await expect(serviceNavigation.menuButton()).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await expect(
      serviceNavigation.menu().getByRole('link', { name: 'Sign out' })
    ).toBeVisible()

    await serviceNavigation.menuButton().click()

    await expect(serviceNavigation.menuButton()).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await expect(serviceNavigation.menu()).toBeHidden()
  })

  test('Should drop the menu button and show the navigation when the screen widens', async ({
    page
  }) => {
    const serviceNavigation = await signInToANavigationThatCollapses(page)

    await expect(serviceNavigation.menu()).toBeHidden()

    await page.setViewportSize({ width: 1280, height: 800 })

    await expect(serviceNavigation.menuButton()).toBeHidden()
    await expect(serviceNavigation.menu()).toBeVisible()
  })
})
