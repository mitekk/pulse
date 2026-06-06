# Frontend Rules

Applies to all React + Vite + TypeScript frontend code.

## Project Structure

```
frontend/src/
  components/   shared, reusable UI components
  pages/        route-level components (one per route)
  hooks/        custom hooks
  api/          typed API client functions (one file per resource)
  types/        shared TypeScript interfaces and types
  lib/          utility functions, constants, config
```

## TypeScript

- No `any`. Use `unknown` + type narrowing for externally-typed data.
- Type all component props. Use `interface` for props, `type` for unions/aliases.
- Shared request/response types go in `types/api.ts` — generated from or aligned with the API contract table.
- Enable strict mode in `tsconfig.json`.

## Environment Variables

- All client-side env vars must be prefixed with `VITE_` (Vite requirement).
- Never expose secrets — anything with `VITE_` prefix is visible in the browser bundle.
- Access via `import.meta.env.VITE_API_URL`, not `process.env`.
- Provide `.env.example` with all `VITE_*` vars and placeholder values.
- Dev proxy: configure `server.proxy` in `vite.config.ts` to forward `/api` to the backend instead of hardcoding `localhost` URLs.

## Vite Config Standards

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true  // for debugging production builds
  }
})
```

## Accessibility (a11y)

- Use semantic HTML: `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>` — not `<div>` for everything.
- All images need an `alt` attribute. Decorative images: `alt=""`.
- Icon-only buttons must have `aria-label`: `<button aria-label="Close dialog"><XIcon /></button>`.
- Form inputs need associated `<label>` elements (use `htmlFor` + `id`, or wrap input in label).
- Color alone must not convey meaning — pair color with text or icon.
- Interactive elements must be keyboard-reachable (avoid `onClick` on non-interactive elements like `<div>`).

## Code Quality

- No `console.log`, `console.warn`, or `console.error` in production code — use a logger or remove before commit.
- No commented-out code blocks — if you're removing code, remove it.
- No hardcoded API URLs — use env vars or the Vite proxy.
- All async operations must have loading, error, and empty states — these are features, not polish.

## State Management

- **Server state**: TanStack Query for all API data. No raw `useEffect + fetch`.
- **Global client state**: Zustand — only when state genuinely crosses component trees. Prefer local state first.
- **Form state**: React Hook Form + Zod. Validate at submission AND show field-level errors inline.
- **URL state**: use query params for filterable/shareable state (search terms, pagination, tab selection).

## Error Handling

- Wrap each route in a React `ErrorBoundary` to catch render errors.
- API errors: catch in the API client layer, transform to a consistent shape before re-throwing.
- Show user-friendly error messages — never raw API error strings or stack traces.

## Testing Hooks

- Every interactive element must have a `data-testid` attribute. Playwright depends on these.
- Name `data-testid` values descriptively: `data-testid="submit-login-form"`, not `data-testid="button"`.
- Never use CSS class names or text content as test selectors — they break on redesigns.
