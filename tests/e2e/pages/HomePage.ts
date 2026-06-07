import type { Page, Locator } from '@playwright/test'

export class HomePage {
  readonly page: Page

  readonly composeButton: Locator
  readonly composerTextarea: Locator
  readonly composerSubmit: Locator
  readonly postComposer: Locator
  readonly menuLogout: Locator
  readonly userMenuTrigger: Locator

  constructor(page: Page) {
    this.page = page
    this.composeButton = page.getByTestId('compose-button-home')
    this.composerTextarea = page.getByTestId('composer-textarea')
    this.composerSubmit = page.getByTestId('composer-submit')
    this.postComposer = page.getByTestId('post-composer')
    // user-menu-trigger appears in both compact (.shell-nav-compact-inner) and
    // full (.shell-nav-full) nav rails. At Desktop Chrome viewport (1280px),
    // the full rail is visible and the compact rail is hidden. Use .last() since
    // the full-rail copy appears second in DOM order. If viewport changes,
    // this may need revisiting.
    this.menuLogout = page.getByTestId('menu-logout').last()
    this.userMenuTrigger = page.getByTestId('user-menu-trigger').last()
  }

  async goto() {
    await this.page.goto('/')
  }

  async composePost(text: string) {
    await this.composerTextarea.fill(text)
    await this.composerSubmit.click()
  }

  async logout() {
    await this.userMenuTrigger.click()
    await this.menuLogout.click()
  }

  postCard(index = 0) {
    return this.page.getByTestId('post-card').nth(index)
  }

  postCards() {
    return this.page.getByTestId('post-card')
  }
}
