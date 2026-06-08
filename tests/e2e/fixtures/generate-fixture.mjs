// Generates the tour's media upload subject: a real, processable portrait JPEG.
// Committed alongside the output so the tour has a deterministic, CI-safe image
// (no dependency on a personal photo). Swap lightbox-subject.jpg for your own
// file at the same path to use a different subject.
//
// Run from the backend workspace so `sharp` resolves:
//   cd backend && node ../tests/e2e/fixtures/generate-fixture.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const out = join(dirname(fileURLToPath(import.meta.url)), 'lightbox-subject.jpg')

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1333" viewBox="0 0 1000 1333">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7cc576"/>
      <stop offset="100%" stop-color="#2f6e4f"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="1333" fill="url(#bg)"/>
  <!-- shape-sorter nods (matches the daycare photo's toy) -->
  <polygon points="500,520 690,630 690,850 500,960 310,850 310,630"
           fill="#4b3f72" stroke="#ffffff" stroke-width="10"/>
  <circle cx="500" cy="740" r="95" fill="none" stroke="#f4d35e" stroke-width="18"/>
  <circle cx="760" cy="360" r="70" fill="#f4d35e"/>
  <text x="500" y="1180" font-family="monospace" font-size="54" font-weight="700"
        fill="#ffffff" text-anchor="middle">TOUR TEST IMAGE</text>
</svg>`

await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(out)
console.log(`wrote ${out}`)
