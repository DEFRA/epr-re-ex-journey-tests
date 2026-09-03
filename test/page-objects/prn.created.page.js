import { Page } from 'page-objects/page'

class PRNCreatedPage extends Page {
  returnToRegistrationPage() {
    return this.returnToHomeLink()
  }
}

export { PRNCreatedPage }
