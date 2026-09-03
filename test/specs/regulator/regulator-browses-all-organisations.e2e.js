import { test, expect } from '@playwright/test'

import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'
import {
  assertNoSeriousOrCriticalViolations,
  scanPageForAccessibilityViolations,
  tagAccessibilityTest
} from '../../support/accessibility.js'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'
test.describe('A regulator browsing every organisation @regulator', () => {
  test('reads the list, narrows it to one organisation, and clears the search again @regulatorbrowse', async ({
    page
  }) => {
    const homePage = new RegulatorHomePage(page)
    const loginPage = new RegulatorLoginPage(page)
    const serviceNavigation = new ServiceNavigation(page)
    const violations = []

    await tagAccessibilityTest('Regulator All organisations page')

    // The seed is what puts a real organisation in the list with a real
    // status. Nothing below writes the status it goes on to assert - linking
    // the organisation to a Defra ID is what makes the backend call it active.
    const seeded = await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    expect(await homePage.getHeadingText()).toBe('All organisations')
    expect(await homePage.getDescriptionText()).not.toBe('')

    // The service navigation names where a regulator can go, and marks the
    // page they are on. This page is their home while the list has nowhere
    // else to live, so it is the one destination the navigation offers, and
    // reading the whole set says no second tab appeared beside it.
    expect(await serviceNavigation.linkTexts()).toEqual(['Home', 'Sign out'])
    expect(await serviceNavigation.currentLinkText()).toBe('Home')

    // The page is a search panel and a browse table, each under its own
    // heading. Comparing the whole set is what says a third section has not
    // arrived unnoticed.
    expect(await homePage.getSectionHeadings()).toEqual([
      'Search reprocessors and exporters',
      'Browse organisations'
    ])

    expect(await homePage.getColumnHeadings()).toEqual([
      'Name',
      'Organisation ID',
      'Regulator',
      'Organisation status',
      'Actions'
    ])

    // Nothing has been searched for yet, so the panel offers one control and
    // the table is the whole list.
    expect(await homePage.getSearchTerm()).toBe('')
    expect(await homePage.getSearchControls()).toEqual(['Search'])

    const browsed = await homePage.getTableData()

    expect(browsed.length).toBeGreaterThan(0)

    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Regulator all organisations'
      ))
    )

    await homePage.searchFor(seeded.companyName)

    // The seeded company name carries a random suffix, so a match on it is one
    // row - which asserts that the search narrowed the list rather than
    // leaving every organisation on screen.
    expect(await homePage.getTableData()).toEqual([
      {
        name: seeded.companyName,
        organisationId: `${seeded.orgId}`,
        regulator: 'EA',
        status: 'Active'
      }
    ])

    // The colour is what separates one status from another at a glance, and it
    // comes from the status the backend holds rather than from this spec.
    expect(await homePage.getStatusTagClasses(1)).toContain('govuk-tag--green')

    // Every action reads the same, so the name a screen reader hears is what
    // tells one row's link from another's.
    expect(await homePage.getActionHiddenText(1)).toBe(seeded.companyName)

    // A running search keeps its term and gains a way out of itself.
    expect(await homePage.getSearchTerm()).toBe(seeded.companyName)
    expect(await homePage.getSearchControls()).toEqual([
      'Search',
      'Clear search'
    ])

    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Regulator all organisations, searched'
      ))
    )

    await homePage.clearSearchLink().click()

    // Clearing drops the term and puts the whole list back. Other journeys
    // seed organisations of their own while this one runs, so the list can
    // only have grown since it was first read, never shrunk.
    expect(await homePage.getSearchTerm()).toBe('')
    expect(await homePage.getSearchControls()).toEqual(['Search'])
    expect((await homePage.getTableData()).length).toBeGreaterThanOrEqual(
      browsed.length
    )

    await assertNoSeriousOrCriticalViolations(violations)
  })
})
