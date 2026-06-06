# Security Rules

Applies to all code — frontend and backend.

## Secrets

- Never commit `.env` files; always provide `.env.example` with placeholder values
- No credentials, API keys, or tokens hardcoded in source
- Never log sensitive values (passwords, tokens, PII)

## Authentication

- JWT: store in httpOnly, Secure, SameSite=Strict cookies — never in localStorage (XSS risk)
- Validate and verify tokens on every protected route — no client-side-only auth checks
- Hash passwords with bcrypt or argon2; minimum cost factor of 12

## Transport & CORS

- HTTPS only in production
- CORS: explicit origin allow-list; never `Access-Control-Allow-Origin: *` in production
- Set security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

## Input & Output

- Validate and sanitize all user input at the boundary (API handlers, form submissions)
- Parameterized queries always — never string interpolation in SQL
- `dangerouslySetInnerHTML` forbidden without explicit sanitization (use DOMPurify)
- Escape user-generated content before rendering as HTML

## API Security

- Rate-limit auth endpoints (login, register, password reset) at minimum
- Return generic error messages for auth failures — do not reveal whether email/username exists
- Never expose stack traces, internal paths, or DB details in error responses
- Apply least-privilege to DB roles and API keys

## Dependency Security

- Keep dependencies up to date; run `npm audit` / `pip-audit` before submission
- No packages with known critical vulnerabilities
