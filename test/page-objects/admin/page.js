import { Page } from 'page-objects/page'
import config from '../../config/config.js'

// epr-re-ex-admin-frontend is served separately from the global wdio
// baseUrl (which points at epr-frontend), so build an absolute URL here
// rather than letting browser.url() prepend baseUrl.
class AdminPage extends Page {
  open(path) {
    return super.open(`${config.adminUri}${path}`)
  }
}

export { AdminPage }
