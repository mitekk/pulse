import type { Page, Locator } from '@playwright/test'

/**
 * A post / thread view at /@:handle/status/:postId — the focused post, its
 * stats, the ancestor chain, the reply composer, and the replies list.
 */
export class ThreadPage {
  readonly page: Page
  readonly view: Locator
  readonly focusedPost: Locator
  readonly stats: Locator
  readonly statLikes: Locator
  readonly statReposts: Locator
  readonly ancestorChain: Locator
  readonly replyComposer: Locator
  readonly replyTextarea: Locator
  readonly replySubmit: Locator
  readonly repliesSection: Locator
  readonly backButton: Locator

  constructor(page: Page) {
    this.page = page
    this.view = page.getByTestId('thread-view')
    this.focusedPost = page.getByTestId('focused-post')
    this.stats = page.getByTestId('post-stats')
    this.statLikes = page.getByTestId('stat-likes')
    this.statReposts = page.getByTestId('stat-reposts')
    this.ancestorChain = page.getByTestId('ancestor-chain')
    this.replyComposer = page.getByTestId('reply-composer-section')
    this.replyTextarea = this.replyComposer.getByTestId('composer-textarea')
    this.replySubmit = this.replyComposer.getByTestId('composer-submit')
    this.repliesSection = page.getByTestId('replies-section')
    this.backButton = page.getByTestId('thread-back')
  }

  async goto(handle: string, postId: string) {
    await this.page.goto(`/@${handle}/status/${postId}`)
    await this.view.waitFor({ state: 'visible' })
  }

  async reply(text: string) {
    await this.replyTextarea.fill(text)
    await this.replySubmit.click()
  }
}
