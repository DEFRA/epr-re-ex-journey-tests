class Navigation {
  constructor(page) {
    this.page = page
  }

  async clickOnLink(linkText) {
    // GOV.UK service navigation links render with significant leading/
    // trailing whitespace around the text (indentation inside the <a>), so
    // the exact-match regex must tolerate it rather than anchoring directly
    // to the trimmed text - otherwise it never matches.
    const escaped = linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await this.page
      .locator('#navigation li a', {
        hasText: new RegExp(`^\\s*${escaped}\\s*$`)
      })
      .click()
  }
}

export { Navigation }
