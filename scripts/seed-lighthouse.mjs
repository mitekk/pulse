// ============================================================
// Seed deterministic public content for the Lighthouse CI run.
//
// Registers a demo user and creates one public post via the API, then writes
// the crawlable URLs to .lighthouse-urls.json for lighthouserc.cjs to read.
// Run after the Docker stack is healthy and migrations have applied.
//
//   LH_BASE_URL=http://localhost:18080 node scripts/seed-lighthouse.mjs
// ============================================================

import { writeFileSync } from 'node:fs'

const BASE = process.env.LH_BASE_URL ?? 'http://localhost:8080'
const PASSWORD = 'LhPass!12345'
const suffix = Date.now().toString(36)
const handle = `lhdemo${suffix}`.slice(0, 20)

const json = { 'Content-Type': 'application/json', Origin: BASE }

async function main() {
  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({
      email: `${handle}@lh.test`,
      handle,
      displayName: 'Lighthouse Demo',
      password: PASSWORD,
    }),
  })
  if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`)
  const { accessToken } = await reg.json()

  const post = await fetch(`${BASE}/api/v1/posts`, {
    method: 'POST',
    headers: { ...json, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      text: 'Welcome to PULSE — a real-time microblogging demo post used for SEO benchmarking. #hello',
    }),
  })
  if (!post.ok) throw new Error(`post failed: ${post.status} ${await post.text()}`)
  const { post: created } = await post.json()

  const urls = [`${BASE}/login`, `${BASE}/@${handle}`, `${BASE}/@${handle}/status/${created.id}`]
  writeFileSync('.lighthouse-urls.json', JSON.stringify(urls, null, 2))
  // eslint-disable-next-line no-console
  console.log('[seed-lighthouse] wrote .lighthouse-urls.json:\n' + urls.join('\n'))
}

main().catch((err) => {
  process.stderr.write(`[seed-lighthouse] ${String(err)}\n`)
  process.exit(1)
})
