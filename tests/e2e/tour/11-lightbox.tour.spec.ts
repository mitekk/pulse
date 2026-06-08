import { test, expect } from './fixtures'
import { ComposeModal } from '../pages/ComposeModal'
import * as path from 'path'

/** The tour's media subject — a real, processable portrait JPEG (see fixtures/). */
const IMAGE_FIXTURE = path.join(__dirname, '..', 'fixtures', 'lightbox-subject.jpg')

/**
 * Photo lightbox — now driven for real. Composes a post with TWO images (the
 * per-post max) so the lightbox exposes its counter, dot indicators, and
 * prev/next controls, then opens it and navigates. The upload runs the full
 * pipeline: presigned POST → MinIO → finalize → worker → ready.
 */
test.describe('Tour 11 — lightbox', () => {
  test('uploads a 2-image post, opens the lightbox, and navigates', async ({ authedPage: page }) => {
    const text = `Lightbox ${Date.now()}`
    const compose = new ComposeModal(page)

    await compose.open()
    await compose.attachImages([IMAGE_FIXTURE, IMAGE_FIXTURE])
    await expect(compose.removeButtons).toHaveCount(2)
    await compose.fill(text)
    await expect(compose.submit).toBeEnabled({ timeout: 60_000 })
    await compose.submitPost()
    await expect(compose.modal).toHaveCount(0, { timeout: 15_000 })

    // In the home feed the whole card is a link, so a media click opens the
    // post detail page. The lightbox is opened from the focused post there.
    await page.goto('/')
    const card = page.getByTestId('post-card').filter({ hasText: text }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.getByTestId('media-item-0').click()

    const focused = page.getByTestId('focused-post')
    await expect(focused).toBeVisible({ timeout: 15_000 })
    await focused.getByTestId('media-item-0').click()

    // Lightbox chrome: image, counter, and both dot indicators.
    const lightbox = page.getByTestId('lightbox')
    await expect(lightbox).toBeVisible()
    await expect(page.getByTestId('lightbox-image')).toBeVisible()
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 / 2')
    await expect(page.getByTestId('lightbox-dot-0')).toBeVisible()
    await expect(page.getByTestId('lightbox-dot-1')).toBeVisible()

    // Next → second image, prev → back to the first.
    await page.getByTestId('lightbox-next').click()
    await expect(page.getByTestId('lightbox-counter')).toHaveText('2 / 2')
    await page.getByTestId('lightbox-prev').click()
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 / 2')

    // Close dismisses the overlay.
    await page.getByTestId('lightbox-close').click()
    await expect(lightbox).toHaveCount(0)
  })
})
