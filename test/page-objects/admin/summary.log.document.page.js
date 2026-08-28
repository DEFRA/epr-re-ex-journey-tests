import { AdminPage } from 'page-objects/admin/page'

// The admin summary-log document page (admin-frontend PAE-1905) renders the
// whole stored SummaryLog document as pretty-printed JSON inside
// <code class="app-json-display">. Parsing it back is how a test asserts on
// the document's contents.
class SummaryLogDocumentPage extends AdminPage {
  async getDocument() {
    const text = await this.page.locator('.app-json-display').innerText()
    return JSON.parse(text)
  }
}

export { SummaryLogDocumentPage }
