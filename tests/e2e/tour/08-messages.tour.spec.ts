import { test, expect } from './fixtures'
import { readTourState } from './tour-state'
import { MessagesPage } from '../pages/MessagesPage'

/**
 * Direct messages: the seeded conversation appears, opens to its thread, accepts
 * a new outgoing message, and the new-DM modal resolves to a conversation.
 * (Realtime delivery / typing / read receipts are intentionally out of scope.)
 */
test.describe('Tour 08 — messages', () => {
  test('seeded conversation opens and shows its message', async ({ authedPage: page }) => {
    const { seed } = readTourState()
    const messages = new MessagesPage(page)
    await messages.goto()

    await expect(messages.conversationList).toBeVisible()
    await messages.conversationRow(seed.conversationId).click()

    await expect(messages.conversationPage).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Welcome to the tour!')).toBeVisible({ timeout: 15_000 })
  })

  test('sends a message into the conversation', async ({ authedPage: page }) => {
    const { seed } = readTourState()
    const messages = new MessagesPage(page)
    await page.goto(`/messages/${seed.conversationId}`)
    await expect(messages.conversationPage).toBeVisible({ timeout: 15_000 })

    const text = `Tour DM ${Date.now()}`
    await messages.sendMessage(text)
    // Scope to the thread: the composer textarea also contains the typed text,
    // so an unscoped getByText would match two elements.
    await expect(messages.messageThread.getByText(text)).toBeVisible({ timeout: 15_000 })
  })

  test('new-DM modal resolves to a conversation', async ({ authedPage: page }) => {
    const { peerUser } = readTourState()
    const messages = new MessagesPage(page)
    await messages.goto()

    await messages.startNewDm(peerUser.handle)
    await expect(messages.conversationPage).toBeVisible({ timeout: 15_000 })
  })
})
