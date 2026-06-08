import type { Page, Locator } from '@playwright/test'

/**
 * Engagement controls (like / repost / quote / bookmark / reply) scoped to a
 * single post. Construct it from a container locator — a `post-card` in a feed
 * or the `focused-post` on a thread page — so the actions target that post only.
 */
export class ActionBar {
  readonly page: Page
  readonly root: Locator
  readonly like: Locator
  readonly repost: Locator
  readonly bookmark: Locator
  readonly reply: Locator

  constructor(page: Page, container: Locator) {
    this.page = page
    this.root = container.getByTestId('action-bar')
    this.like = this.root.getByTestId('action-like')
    this.repost = this.root.getByTestId('action-repost')
    this.bookmark = this.root.getByTestId('action-bookmark')
    this.reply = this.root.getByTestId('action-reply')
  }

  async toggleLike() {
    await this.like.click()
  }

  async toggleBookmark() {
    await this.bookmark.click()
  }

  /** Opens the repost menu and clicks repost/undo, then confirms if a dialog appears. */
  async toggleRepost() {
    await this.repost.click()
    await this.page.getByTestId('repost-menu').getByTestId('repost-toggle').click()
    const confirm = this.page.getByTestId('confirm-dialog-confirm')
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click()
    }
  }

  /** Opens the repost menu and selects Quote → returns the compose modal handle to the caller. */
  async openQuote() {
    await this.repost.click()
    await this.page.getByTestId('repost-menu').getByTestId('quote-post').click()
  }
}
