import { Page } from 'page-objects/page'

class PRNCancelledPage extends Page {
  async statusText() {
    return this.panelDetailText()
  }

  async pernsPage() {
    await this.goToPernsPage()
  }

  async prnsPage() {
    await this.goToPrnsPage()
  }
}

export { PRNCancelledPage }
