import type { Page, Locator } from '@playwright/test'

/**
 * The compose modal (route /compose) and its PostComposer. All locators are
 * scoped to the `compose-modal` container so they don't collide with the inline
 * home composer, which also renders a `composer-textarea`.
 */
export class ComposeModal {
  readonly page: Page
  readonly modal: Locator
  readonly textarea: Locator
  readonly submit: Locator
  readonly charRing: Locator
  readonly closeButton: Locator
  readonly replyPolicyTrigger: Locator
  readonly fileInput: Locator
  readonly attachButton: Locator
  readonly attachments: Locator
  readonly removeButtons: Locator

  constructor(page: Page) {
    this.page = page
    this.modal = page.getByTestId('compose-modal')
    this.textarea = this.modal.getByTestId('composer-textarea')
    this.submit = this.modal.getByTestId('composer-submit')
    this.charRing = this.modal.getByTestId('char-ring')
    this.closeButton = this.modal.getByTestId('close-compose-modal')
    this.replyPolicyTrigger = this.modal.getByTestId('reply-policy-trigger')
    this.fileInput = this.modal.locator('input[type="file"]')
    this.attachButton = this.modal.getByTestId('attach-media-button')
    this.attachments = this.modal.getByTestId('media-attachments')
    this.removeButtons = this.modal.getByTestId('remove-attachment')
  }

  /** Opens the modal by navigating to /compose (avoids ambiguity over which compose button is visible). */
  async open() {
    await this.page.goto('/compose')
    await this.modal.waitFor({ state: 'visible' })
  }

  async fill(text: string) {
    await this.textarea.fill(text)
  }

  async submitPost() {
    await this.submit.click()
  }

  async selectReplyPolicy(policy: 'everyone' | 'following' | 'mentioned') {
    await this.replyPolicyTrigger.click()
    await this.modal.getByTestId(`reply-policy-${policy}`).click()
  }

  /**
   * Attaches one or more local files to the hidden file input (the composer's
   * input is `multiple`). Pass the same path twice to attach two copies.
   */
  async attachImages(paths: string[]) {
    await this.fileInput.setInputFiles(paths)
  }
}
