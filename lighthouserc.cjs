// ============================================================
// Lighthouse CI — the SEO/quality benchmark gate.
//
// URLs come from scripts/seed-lighthouse.mjs (.lighthouse-urls.json); falls
// back to the login page if the seed has not run. Desktop preset keeps the
// performance metric stable in CI containers.
//
// Gate rationale (see docs/adr/0011-seo-benchmark-gates.md):
//   • SEO            → 1.00 (hard gate; fully under our control)
//   • Accessibility  → 0.90 (gate, with margin for single-audit variance)
//   • Best Practices → 0.90 (gate, with margin)
//   • Performance    → 0.80 (warn; container CPU variance makes it noisy)
// ============================================================

const fs = require('node:fs');

const BASE = process.env.LH_BASE_URL || 'http://localhost:8080';
let urls = [`${BASE}/login`];
try {
  const seeded = JSON.parse(fs.readFileSync('.lighthouse-urls.json', 'utf8'));
  if (Array.isArray(seeded) && seeded.length > 0) urls = seeded;
} catch {
  // no seed file — fall back to the always-available login page
}

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox --disable-gpu --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:seo': ['error', { minScore: 1 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci',
    },
  },
};
