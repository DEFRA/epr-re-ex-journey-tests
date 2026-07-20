import { browser } from '@wdio/globals'

class Page {
  open(path) {
    return browser.url(path)
  }
}

export { Page }
