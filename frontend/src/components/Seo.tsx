// ============================================================
// Seo — per-route document metadata
//
// Uses React 19's native metadata hoisting: <title>, <meta> and
// <link> rendered anywhere in the tree are moved into <head>.
// No external head-management dependency.
//
// This drives the *client-rendered* experience (browser tab titles,
// JS-capable crawlers like Googlebot). Non-JS social scrapers are
// served server-rendered tags by the backend SEO layer (see nginx
// bot routing + backend `seo` module).
// ============================================================

import { SITE_NAME, DEFAULT_OG_IMAGE, siteOrigin } from '@/lib/seo'

interface SeoProps {
  /** Page-specific title; the site name is appended automatically. */
  title: string
  description?: string
  /** Canonical path beginning with `/` (e.g. `/@ada/status/123`). */
  path?: string
  image?: string | null
  type?: 'website' | 'article' | 'profile'
  card?: 'summary' | 'summary_large_image'
  noindex?: boolean
}

export function Seo({
  title,
  description,
  path,
  image,
  type = 'website',
  card = 'summary_large_image',
  noindex = false,
}: SeoProps) {
  const origin = siteOrigin()
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} / ${SITE_NAME}`
  const url = path ? `${origin}${path}` : origin || undefined
  const ogImage = image
    ? image.startsWith('http')
      ? image
      : `${origin}${image}`
    : `${origin}${DEFAULT_OG_IMAGE}`

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {url && <link rel="canonical" href={url} />}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:image" content={ogImage} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={card} />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
    </>
  )
}
