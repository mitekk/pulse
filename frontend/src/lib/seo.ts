// ============================================================
// SEO helpers — site constants + metadata builders.
// Kept separate from the <Seo> component so the component file
// only exports a component (react-refresh / fast-refresh friendly).
// ============================================================

export const SITE_NAME = 'PULSE'

/** Default share image (1200×630). */
export const DEFAULT_OG_IMAGE = '/og-default.png'

/** Absolute site origin. Prefer build-time env, fall back to the runtime origin. */
export function siteOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_URL as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** Collapse whitespace and clamp to `max` characters with an ellipsis. */
export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + '…'
}
