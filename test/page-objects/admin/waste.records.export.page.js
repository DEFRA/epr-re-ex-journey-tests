import { AdminPage } from 'page-objects/admin/page'
import { browser } from '@wdio/globals'

class WasteRecordsExportPage extends AdminPage {
  open() {
    return super.open('/waste-records-export')
  }

  async fetchCsv() {
    return browser.execute(async () => {
      const form = document.querySelector('#main-content form')
      if (!form) {
        throw new Error('Waste records export form not found')
      }

      const formData = new URLSearchParams()
      for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (
        form.querySelectorAll('input[name]')
      )) {
        formData.set(input.name, input.value)
      }

      const response = await fetch('/waste-records-export', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: formData.toString()
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

export default new WasteRecordsExportPage()
