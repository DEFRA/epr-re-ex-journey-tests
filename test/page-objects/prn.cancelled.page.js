import { Page } from 'page-objects/page'

class PRNCancelledPage extends Page {
  async statusText() {
    return this.panelDetailText()
  }

  pernsPage() {
    return this.pernsPageLink()
  }

  prnsPage() {
    return this.prnsPageLink()
  }
}

export { PRNCancelledPage }
