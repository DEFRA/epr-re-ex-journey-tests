import { Page } from 'page-objects/page'
import config from '../../config/config.js'

// epr-re-ex-admin-frontend is served separately from the global Playwright
// baseURL (which points at epr-frontend), so build an absolute URL here
// rather than letting page.goto() prepend baseURL.
class AdminPage extends Page {
  open(path) {
    return super.open(`${config.adminUri}${path}`)
  }

  async getHeaderText() {
    return this.page.locator('#main-content h1.govuk-heading-xl').innerText()
  }

  /**
   * @param {string} endpoint
   */
  async fetchCsv(endpoint) {
    return this.page.evaluate(async (endpoint) => {
      const form = document.querySelector('#main-content form')
      if (!form) {
        throw new Error(`Export form not found at ${endpoint}`)
      }

      const formData = new URLSearchParams()
      for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (
        form.querySelectorAll('input[name]')
      )) {
        formData.set(input.name, input.value)
      }

      const response = await fetch(endpoint, {
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
    }, endpoint)
  }
}

export { AdminPage }
