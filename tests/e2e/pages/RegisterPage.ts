import type { Page, Locator } from '@playwright/test'

export class RegisterPage {
  readonly page: Page

  readonly displayNameInput: Locator
  readonly emailInput: Locator
  readonly handleInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly loginLink: Locator

  constructor(page: Page) {
    this.page = page
    this.displayNameInput = page.getByTestId('input-display-name')
    this.emailInput = page.getByTestId('input-email')
    this.handleInput = page.getByTestId('input-handle')
    this.passwordInput = page.getByTestId('input-password')
    this.submitButton = page.getByTestId('submit-register-form')
    this.loginLink = page.getByTestId('link-login')
  }

  async goto() {
    await this.page.goto('/register')
  }

  async register(opts: {
    displayName: string
    email: string
    handle: string
    password: string
  }) {
    await this.displayNameInput.fill(opts.displayName)
    await this.emailInput.fill(opts.email)
    await this.handleInput.fill(opts.handle)
    await this.passwordInput.fill(opts.password)
    await this.submitButton.click()
  }
}
