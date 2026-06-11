# ADR-0011: SEO Benchmark Gates — Lighthouse CI + Bundle-Size Budget

- **Date**: 2026-06-11
- **Status**: Accepted
- **Deciders**: SEO initiative, lead architect, human gate

## Context and Problem Statement

"Improve all benchmarks" presupposes benchmarks exist. PULSE had **none**: no Lighthouse CI, no web-vitals collection, no bundle-size budget, no SEO scoring of any kind. Without a measured, enforced baseline, the SEO/quality work done in [ADR-0010](0010-seo-crawlability-and-dynamic-rendering.md) (plus performance, header, and accessibility fixes) would silently regress on the next feature PR. The product owner asked that the benchmarks **gate the build** (fail on regression), not merely report.

## Decision Drivers

- The four Lighthouse categories — Performance, Accessibility, Best Practices, SEO — are the industry-standard web-quality benchmark and run on the rendered page.
- The gate must be **reproducible in CI**. Lighthouse needs a real, crawlable URL; PULSE content is dynamic, so the run requires deterministic seeded content.
- Performance scores in CI containers are **noisy** (shared-CPU throttling varies run to run); gating hard on a flaky metric produces false failures and erodes trust in the gate.
- SEO is the category most under our direct control (meta, robots, sitemap, semantic HTML) and our headline deliverable — it should be the hardest gate.
- A separate, cheap **bundle-size budget** catches JS-weight regressions without needing the full stack.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Lighthouse CI (`@lhci/cli`) against the dockerized stack with seeded content + `size-limit` budget, gating in CI | Standard tooling; runs the real prod-like stack; per-category thresholds; artifacts on every run | Adds a full stack boot to CI (~minutes); needs a seed step | **Selected** |
| Report-only (collect scores as artifacts, never block) | Simplest; no flakiness | No enforcement — regressions merge silently; fails the product owner's explicit "gate the build" requirement | Rejected |
| Gate every category hard at 100/100/95/80 | Maximal strictness | Perf flakiness in CI containers → frequent false failures; brittle gate gets disabled in practice | Rejected (see threshold split below) |

## Decision Outcome

**Chosen**: Lighthouse CI via a JS config (`lighthouserc.cjs`) plus a `size-limit` budget, both enforced as CI jobs.

**Reproducibility**: A `lighthouse` CI job boots the same dockerized stack as the e2e job (`docker-compose.e2e.yml`, `FRONTEND_PORT=18080`), runs migrations, then `scripts/seed-lighthouse.mjs` registers a demo user and one public post via the API and writes the crawlable URLs to `.lighthouse-urls.json`. `lighthouserc.cjs` reads that file (falling back to `/login`) and audits `/login`, the public profile, and the public post. The **desktop preset** is used to reduce performance-metric variance.

**Threshold split** (the core of this decision):

| Category | Level | minScore | Rationale |
|----------|-------|----------|-----------|
| SEO | `error` (gate) | 1.00 | Fully under our control; the headline deliverable |
| Accessibility | `error` (gate) | 0.90 | Strong gate, with margin for single-audit variance |
| Best Practices | `error` (gate) | 0.90 | Strong gate, with margin |
| Performance | `warn` | 0.80 | Container CPU variance makes a hard gate flaky; reported, not blocking |

Gating the deterministic categories (SEO/A11y/Best Practices) honours "gate the build" while warning on the genuinely noisy metric (Performance) keeps the gate trustworthy rather than flaky. Expected real scores are higher than the gate floors (≈100 SEO, ≈100 BP, ≈95 A11y, ≈85 Perf desktop); the floors carry operational margin and can be tightened once CI baselines are observed. Results upload as artifacts (`.lighthouseci/`) on every run.

**Bundle-size budget**: `size-limit` (`@size-limit/file`) enforces brotli budgets on the always-loaded chunks — app entry ≤ 25 kB and `react-vendor` ≤ 95 kB — in a standalone `bundle-size` CI job (no stack boot). Vendor chunking (see Vite `manualChunks`) keeps framework code in long-cacheable chunks separate from app code.

**Positive Consequences**:
- SEO/quality posture cannot silently regress; PRs that drop a gated category fail CI.
- Performance is tracked without inflicting flaky failures.
- Bundle weight is bounded cheaply and independently of the Lighthouse job.

**Negative Consequences / Risks**:
- The `lighthouse` job adds a full stack boot to CI; mitigated by running it in parallel with `build` (both `needs: e2e`).
- `@lhci/cli` is a dev-only dependency with transitive advisories (old `inquirer`/`tmp`); production deps remain clean (`npm audit --omit=dev`) and `tmp` is pinned via a root `overrides` to clear the high-severity advisory.
- Seeded content is created fresh per run (unique handle), so scores are reproducible without depending on prior DB state.
