import { test } from '@playwright/test'

/**
 * [NICE] Photo lightbox. Deferred: it requires a post with processed media,
 * which means seeding the full upload pipeline (presigned PUT → MinIO →
 * finalize → async processing). Enable this once tour-setup seeds a media post;
 * then drive: open media → `lightbox` → next/prev/close, counter, dots.
 */
test.describe('Tour 11 — lightbox', () => {
  test.skip('open media post → lightbox navigation', () => {
    // Pending media seeding in tour-setup.ts (see plan: [NICE]).
  })
})
