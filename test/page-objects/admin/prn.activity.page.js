import { AdminPage } from 'page-objects/admin/page'

class PrnActivityPage extends AdminPage {
  open() {
    return super.open('/prn-activity')
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }

  // /prn-activity/download is a plain GET link (not the crumb-POST form
  // pattern the other report pages use), so fetch it directly rather than
  // going through AdminPage.fetchCsv.
  async fetchCsv() {
    return this.page.evaluate(async () => {
      const response = await fetch('/prn-activity/download', {
        credentials: 'same-origin'
      })
      return {
        status: response.status,
        contentDisposition: response.headers.get('content-disposition'),
        contentType: response.headers.get('content-type'),
        body: await response.text()
      }
    })
  }
}

export { PrnActivityPage }
