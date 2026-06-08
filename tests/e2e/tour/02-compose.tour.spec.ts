import { test, expect } from './fixtures'
import { ComposeModal } from '../pages/ComposeModal'
import * as path from 'path'

/** The tour's media subject — a real, processable portrait JPEG (see fixtures/). */
const IMAGE_FIXTURE = path.join(__dirname, '..', 'fixtures', 'lightbox-subject.jpg')

/**
 * Composing posts through the real UI: the modal composer, the inline home
 * composer, the reply-policy selector, the character-limit guard, and a real
 * image upload that runs the full pipeline (presigned POST → MinIO → finalize
 * → worker → ready) before it renders in the feed.
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

  test('uploads an image through the composer and it renders in the home feed', async ({ authedPage: page }) => {
    const text = `Media compose ${Date.now()}`
    const compose = new ComposeModal(page)

    await compose.open()
    await compose.attachImages([IMAGE_FIXTURE])
    await expect(compose.removeButtons).toHaveCount(1)
    await compose.fill(text)

    // Submit stays disabled until the upload finalizes and the worker reports
    // the media as ready — this asserts the whole pipeline end-to-end via the UI.
    await expect(compose.submit).toBeEnabled({ timeout: 60_000 })
    await compose.submitPost()
    await expect(compose.modal).toHaveCount(0, { timeout: 15_000 })

    await page.goto('/')
    const card = page.getByTestId('post-card').filter({ hasText: text }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByTestId('media-grid')).toBeVisible()
    await expect(card.getByTestId('media-item-0')).toBeVisible()
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
