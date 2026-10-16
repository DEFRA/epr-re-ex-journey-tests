import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { PrnActivityPage } from 'page-objects/admin/prn.activity.page'
import { seedDecemberInputReprocessor } from '../../support/seeding/december-reprocessor.js'
import {
  createPrn,
  externalAPIAcceptPrn,
  updatePrnStatus
} from '../../support/seeding/prns.js'
import { registrationStartYear } from '../../support/seeding/summary-logs.js'

// PAE-1991. In specs/admin so the admin frontend's CI (test-scope: admin)
// runs it. A December PRN needs the December window, so a shut window on
// this environment skips rather than fails.
test.describe('PRN activity obligation year @decWaste @prnActivityObligationYear', () => {
  const accreditationYear = registrationStartYear()
  let seeded

  test.beforeAll(async () => {
    seeded = await seedDecemberInputReprocessor()
  })

  test('Should show the Y+1 obligation year RPD accepted a December PRN into @prnActivityObligationYearNext', async ({
    page
  }) => {
    test.skip(
      !seeded.windowOpen,
      'December Waste window is shut on this environment; needs a December PRN'
    )

    const { prnPath } = await createPrn(
      seeded.refNo,
      seeded.registrationId,
      seeded.accreditationId,
      seeded.authHeader,
      1,
      { isDecemberWaste: true }
    )
    await updatePrnStatus(prnPath, seeded.authHeader, 'awaiting_authorisation')
    const { prnNumber } = await updatePrnStatus(
      prnPath,
      seeded.authHeader,
      'awaiting_acceptance'
    )
    await externalAPIAcceptPrn(
      { prnNumber },
      { obligationYear: accreditationYear + 1 }
    )

    await new AdminLoginPage(page).loginAsServiceMaintainer()
    const prnActivityPage = new PrnActivityPage(page)
    await prnActivityPage.open()

    const row = await prnActivityPage.rowFor(prnNumber)
    expect(row['December Waste']).toBe('Yes')
    expect(row['Accreditation Year']).toBe(String(accreditationYear))
    expect(row['Obligation Year']).toBe(String(accreditationYear + 1))
  })
})
