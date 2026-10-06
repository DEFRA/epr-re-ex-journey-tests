import { test, expect } from '@playwright/test'

import { RegulatorStartPage } from 'page-objects/regulator/start.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'

/**
 * @import { Page } from '@playwright/test'
 */

/**
 * A regulator needs no seeded data and still gets a navigation of more than one
 * item, which is what makes GOV.UK collapse it on a narrow screen.
 * @param {Page} page
 */
const signInToANavigationThatCollapses = async (page) => {
  await new RegulatorStartPage(page).loginAsRegulator()

  return new ServiceNavigation(page)
}

// What jsdom cannot reach: that the client script runs in a real browser and
// turns a narrow screen's navigation into a menu a visitor can open and close.
test.describe('Service navigation menu @serviceNavigationMenu', () => {
  test.describe('on a narrow screen', () => {
    test.use({ viewport: { width: 375, height: 800 } })

    test('Should offer a menu button that opens and closes the navigation', async ({
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
      await expect(serviceNavigation.menu()).toBeVisible()
      expect(await serviceNavigation.linkTexts()).toEqual(['Home', 'Sign out'])

      await serviceNavigation.menuButton().click()

      await expect(serviceNavigation.menuButton()).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await expect(serviceNavigation.menu()).toBeHidden()
    })
  })

  test.describe('on a wide screen', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('Should show the navigation without a menu button', async ({
      page
    }) => {
      const serviceNavigation = await signInToANavigationThatCollapses(page)

      await expect(serviceNavigation.menuButton()).toBeHidden()
      await expect(serviceNavigation.menu()).toBeVisible()
    })
  })
})
