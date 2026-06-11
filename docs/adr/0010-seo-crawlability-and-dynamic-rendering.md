# ADR-0010: SEO Crawlability — Public Read Mode + Bot Dynamic Rendering, React 19 Native Metadata

- **Date**: 2026-06-11
- **Status**: Accepted
- **Deciders**: SEO initiative, lead architect, human gate

## Context and Problem Statement

PULSE shipped as a pure client-side React SPA in which **every content route sat behind `AuthGuard`** and redirected unauthenticated visitors to `/login`. Combined with CSR, this meant search engines and social scrapers saw `<title>frontend</title>` over an empty `<div id="root">` and then a login redirect. For a microblogging platform whose primary distribution channel is *shared links*, this is the worst possible posture: zero organic indexing and zero rich link previews (Twitter/Slack/iMessage/Facebook). An SEO audit found no document metadata, no `robots.txt`/`sitemap.xml`, no structured data, and no benchmark tooling.

Two problems had to be solved together: (1) making content **crawlable** at all, and (2) producing **correct metadata for non-JS scrapers**, which never execute the SPA's JavaScript and therefore cannot benefit from any client-rendered `<meta>` tags.

## Decision Drivers

- Social scrapers (Twitterbot, facebookexternalhit, Slackbot, LinkedInBot, Discordbot, WhatsApp) **do not run JavaScript**. Client-injected OG tags are invisible to them — link previews require server-rendered HTML.
- Googlebot renders JS but with delay and budget; server-rendered metadata is strictly better for it too.
- The product is a Twitter/X-style platform where public posts/profiles are the natural model (confirmed with the product owner). Private accounts must remain protected.
- The existing backend already exposed public reads: `GET /posts/:id`, `GET /users/:handle`, etc. all use `OptionalAuthGuard` (returns public data with no token, personalizes when authed). The crawlability blocker was purely the **frontend** `AuthGuard` redirect.
- Introducing full SSR/SSG to a mature CSR app is a large, risky re-architecture; the team wanted the SEO win without rewriting the rendering model.
- React 19 is already in use and natively hoists `<title>`/`<meta>`/`<link>` to `<head>` — per-route metadata needs no new dependency.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Dynamic rendering**: nginx routes known bot user-agents to a backend that returns server-rendered OG/JSON-LD HTML; humans keep the SPA | No SPA re-architecture; leverages existing `PostsService`/`UsersService`; correct previews for non-JS scrapers; isolated, low blast radius | Two render paths to maintain; UA list needs occasional updates; bot/human divergence must stay honest (same canonical content) | **Selected** |
| Full SSR (e.g. migrate to a React framework with server rendering) | Single render path; best-in-class SEO | Large rewrite of a working CSR app; high risk; weeks of work; out of scope | Rejected |
| Build-time prerendering (SSG) | Simple static output | Content is dynamic and per-user; cannot prerender arbitrary posts/profiles | Rejected |
| Client-only meta via React 19 (no server layer) | Zero infra | Invisible to non-JS social scrapers — fails the single highest-value SEO feature (link previews) | Rejected as sole solution (kept as a complement) |

## Decision Outcome

**Chosen**: A two-layer approach.

1. **Public read mode (frontend).** Profile and post routes (`/:handle`, its tabs, `/:handle/status/:postId`, the photo route) are moved out from under the hard auth redirect into an **`AdaptiveShell`** layout element that renders `AppShell` for authenticated users, a lightweight crawlable `PublicShell` (sign-in CTAs, no realtime socket) for guests on routes marked `handle.public`, and redirects guests to `/login` on every other (private) route. Keeping all routes under one layout element avoids remounting the shell when an authed user opens a modal. Privacy is preserved: `ProfilePage` already renders a "protected" lock for private accounts to non-followers, and DMs/notifications/bookmarks/settings stay auth-gated. No backend authorization change was required — the read endpoints were already `OptionalAuthGuard`.

2. **Dynamic rendering (backend + nginx).** A new `SeoModule` exposes `GET /api/v1/seo/prerender` (reads the original path from nginx's `X-Original-URI`), `GET /api/v1/seo/sitemap.xml` (DB-backed), and `GET /api/v1/seo/robots.txt` (host-aware absolute Sitemap URL). nginx detects crawler/social user-agents via a `map $http_user_agent $is_bot` and, in the SPA-fallback `@app` location, rewrites bot requests to an internal `/__prerender` location proxied to the backend; humans get `index.html`. The prerender document carries full Open Graph + Twitter Card (`summary_large_image`) + JSON-LD (`SocialMediaPosting` for posts, `ProfilePage`+`Person` for profiles) with absolute image URLs and HTML-escaped content.

3. **Client metadata (complement).** A `<Seo>` component uses React 19 native metadata hoisting to set per-route `<title>`/description/canonical/OG/Twitter for the human + Googlebot-JS path. Helpers live in `lib/seo.ts` so the component file stays fast-refresh clean.

**Positive Consequences**:
- Shared post/profile links render rich previews everywhere, including non-JS scrapers.
- Public content is indexable and present in a real, DB-backed `sitemap.xml`.
- No rewrite of the CSR rendering model; the change is additive and isolated.
- Private content remains protected; only explicitly public routes are crawlable.

**Negative Consequences / Risks**:
- Two render paths (SPA + prerender) must stay content-consistent; mitigated by both deriving from the same services and canonical URLs.
- The bot user-agent list is a maintenance item; unknown bots fall back to the SPA shell (degraded but not broken).
- `prerender` adds backend load for crawler traffic; bounded and cacheable at the edge if needed.

## Follow-ups
- Benchmark enforcement is covered by [ADR-0011](0011-seo-benchmark-gates.md).
- Consider edge-caching `/__prerender` and `/sitemap.xml` responses if crawler volume grows.
