import { Page } from 'page-objects/page'
import { $ } from '@wdio/globals'

class AdminLoginPage extends Page {
  open() {
    return super.open('/auth/sign-in')
  }

  async enterCredentials(username, password) {
    await $('#username').setValue(username)
    await $('#password').setValue(password)
  }

  async enterCredentialsMSLogin(username, password) {
    const usernameField = await $('#i0116')
    await usernameField.waitForExist({ timeout: 5000 })
    await usernameField.setValue(username)
    const nextButton = await $('#idSIButton9')
    await nextButton.click()

    const passwordField = await $('#i0118')
    await passwordField.waitForExist({ timeout: 5000 })
    await passwordField.setValue(password)
    const nextPWButton = await $('input[value="Sign in"]')
    await nextPWButton.click()

    const submitElement = await $('input[value="Yes"]')
    await submitElement.waitForExist({ timeout: 5000 })
    await submitElement.click()
  }

  async submitCredentials() {
    await $('button[type=submit]').click()
  }
}

export default new AdminLoginPage()
