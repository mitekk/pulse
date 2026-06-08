import { test, expect } from './fixtures'
import { ComposeModal } from '../pages/ComposeModal'

/**
 * Composing posts through the real UI: the modal composer, the inline home
 * composer, the reply-policy selector, and the character-limit guard.
 */
test.describe('Tour 02 — compose', () => {
  test('composes a post via the modal and it appears in the home feed', async ({ authedPage: page }) => {
    const text = `Modal compose ${Date.now()}`
    const compose = new ComposeModal(page)

    await compose.open()
    await compose.fill(text)
    await compose.submitPost()

    await expect(compose.modal).toHaveCount(0, { timeout: 15_000 })
    await page.goto('/')
    await expect(page.getByTestId('home-timeline').getByText(text)).toBeVisible({ timeout: 15_000 })
  })

  test('composes a post via the inline home composer', async ({ authedPage: page }) => {
    const text = `Inline compose ${Date.now()}`
    await page.goto('/')

    const inline = page.getByTestId('home-composer')
    await inline.getByTestId('composer-textarea').fill(text)
    await inline.getByTestId('composer-submit').click()

    await expect(page.getByTestId('home-timeline').getByText(text)).toBeVisible({ timeout: 15_000 })
  })

  test('reply-policy selector switches the audience', async ({ authedPage: page }) => {
    const compose = new ComposeModal(page)
    await compose.open()
    await compose.fill('Followers only please')
    await compose.selectReplyPolicy('following')

    // The trigger reflects the chosen policy.
    await expect(compose.replyPolicyTrigger).toContainText(/follow/i)
  })

  test('blocks submission when the post exceeds the character limit', async ({ authedPage: page }) => {
    const compose = new ComposeModal(page)
    await compose.open()
    await compose.fill('a'.repeat(281))

    await expect(compose.charRing).toBeVisible()
    await expect(compose.submit).toBeDisabled()
  })
})
