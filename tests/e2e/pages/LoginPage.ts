import type { Page, Locator } from '@playwright/test'

export class LoginPage {
  readonly page: Page

  readonly emailOrHandleInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly registerLink: Locator

  constructor(page: Page) {
    this.page = page
    this.emailOrHandleInput = page.getByTestId('input-email-or-handle')
    this.passwordInput = page.getByTestId('input-password')
    this.submitButton = page.getByTestId('submit-login-form')
    this.registerLink = page.getByTestId('link-register')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(emailOrHandle: string, password: string) {
    await this.emailOrHandleInput.fill(emailOrHandle)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
