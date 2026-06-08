import type { Page, Locator } from '@playwright/test'

/**
 * The persistent app shell: left nav rail, theme toggle, user menu, compose.
 *
 * Nav/user-menu testids render in BOTH the compact and full desktop rails. At
 * the Desktop-Chrome viewport (1280px) the full rail is visible; `.last()`
 * targets it (same convention as HomePage.ts).
 *
 * Note: there is no `nav-search` item — Search is reached via the typeahead or
 * by navigating to /search directly.
 */
export class AppShellNav {
  readonly page: Page
  readonly themeToggle: Locator
  readonly userMenuTrigger: Locator
  readonly menuProfile: Locator
  readonly menuLogout: Locator
  readonly composeButton: Locator

  constructor(page: Page) {
    this.page = page
    this.themeToggle = page.getByTestId('theme-toggle').last()
    this.userMenuTrigger = page.getByTestId('user-menu-trigger').last()
    this.menuProfile = page.getByTestId('menu-profile').last()
    this.menuLogout = page.getByTestId('menu-logout').last()
    this.composeButton = page.getByTestId('compose-button').last()
  }

  /** Left-rail nav item, e.g. navItem('home' | 'explore' | 'notifications' | 'messages' | 'bookmarks' | 'settings'). */
  navItem(name: string): Locator {
    return this.page.getByTestId(`nav-${name}`).last()
  }

  notificationsBadge(): Locator {
    return this.page.getByTestId('nav-badge-notifications')
  }

  messagesBadge(): Locator {
    return this.page.getByTestId('nav-badge-messages')
  }

  async openUserMenu() {
    await this.userMenuTrigger.click()
  }

  async logout() {
    await this.openUserMenu()
    await this.menuLogout.click()
  }
}
