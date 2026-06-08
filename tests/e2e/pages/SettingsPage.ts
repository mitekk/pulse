import type { Page, Locator } from '@playwright/test'

/** Settings hub + Account form + Sessions list. */
export class SettingsPage {
  readonly page: Page
  readonly hub: Locator
  readonly linkAccount: Locator
  readonly linkSessions: Locator
  // Account form
  readonly accountForm: Locator
  readonly displayName: Locator
  readonly bio: Locator
  readonly location: Locator
  readonly website: Locator
  readonly isPrivate: Locator
  readonly dmPrivacy: Locator
  readonly saveButton: Locator
  readonly successMessage: Locator
  readonly errorMessage: Locator
  // Sessions
  readonly sessions: Locator
  readonly currentBadge: Locator

  constructor(page: Page) {
    this.page = page
    this.hub = page.getByTestId('settings-hub')
    this.linkAccount = page.getByTestId('settings-link-account')
    this.linkSessions = page.getByTestId('settings-link-sessions')
    this.accountForm = page.getByTestId('account-settings-form')
    this.displayName = page.getByTestId('settings-display-name')
    this.bio = page.getByTestId('settings-bio')
    this.location = page.getByTestId('settings-location')
    this.website = page.getByTestId('settings-website')
    this.isPrivate = page.getByTestId('settings-is-private')
    this.dmPrivacy = page.getByTestId('settings-dm-privacy')
    this.saveButton = page.getByTestId('settings-save-button')
    this.successMessage = page.getByTestId('settings-success-message')
    this.errorMessage = page.getByTestId('settings-error-message')
    this.sessions = page.getByTestId('sessions-settings')
    this.currentBadge = page.getByTestId('session-current-badge')
  }

  async gotoHub() {
    await this.page.goto('/settings')
    await this.hub.waitFor({ state: 'visible' })
  }

  async gotoAccount() {
    await this.page.goto('/settings/account')
    await this.accountForm.waitFor({ state: 'visible' })
  }

  async gotoSessions() {
    await this.page.goto('/settings/sessions')
    await this.sessions.waitFor({ state: 'visible' })
  }
}
