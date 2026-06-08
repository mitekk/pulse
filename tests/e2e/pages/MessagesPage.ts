import type { Page, Locator } from '@playwright/test'

/** Messages list, the new-DM modal, and the conversation thread + composer. */
export class MessagesPage {
  readonly page: Page
  readonly root: Locator
  readonly conversationList: Locator
  readonly newDmButton: Locator
  // New-DM modal
  readonly dmModal: Locator
  readonly dmSearchInput: Locator
  readonly dmNextButton: Locator
  // Conversation thread
  readonly conversationPage: Locator
  readonly messageThread: Locator
  readonly textInput: Locator
  readonly sendButton: Locator
  readonly backButton: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('messages-page')
    this.conversationList = page.getByTestId('conversation-list')
    this.newDmButton = page.getByTestId('new-dm-button')
    this.dmModal = page.getByTestId('compose-dm-modal')
    this.dmSearchInput = page.getByTestId('compose-dm-search-input')
    this.dmNextButton = page.getByTestId('compose-dm-next-button')
    this.conversationPage = page.getByTestId('conversation-page')
    this.messageThread = page.getByTestId('message-thread')
    this.textInput = page.getByTestId('dm-text-input')
    this.sendButton = page.getByTestId('dm-send-button')
    this.backButton = page.getByTestId('conversation-back-button')
  }

  async goto() {
    await this.page.goto('/messages')
    await this.root.waitFor({ state: 'visible' })
  }

  conversationRow(conversationId: string): Locator {
    return this.page.getByTestId(`conversation-row-${conversationId}`)
  }

  messageBubble(messageId: string): Locator {
    return this.page.getByTestId(`message-bubble-${messageId}`)
  }

  /** Drives the new-DM modal: open → search a handle → pick the suggestion → Next. */
  async startNewDm(handle: string) {
    await this.newDmButton.click()
    await this.dmModal.waitFor({ state: 'visible' })
    await this.dmSearchInput.fill(handle)
    await this.page.getByTestId(`dm-suggest-user-${handle}`).click()
    await this.dmNextButton.click()
  }

  async sendMessage(text: string) {
    await this.textInput.fill(text)
    await this.sendButton.click()
  }
}
