# Frontend Subtask 8 — Design System Completion, A11y, Dockerfile

**Completed:** 2026-06-07
**Subtask:** 8 of 8 (final frontend phase)

---

## Primitives Completed

All §C18 gaps are now filled. Every primitive is themed via existing CSS tokens and verified in light + dark:

| Component | File | Notes |
|---|---|---|
| `Button` | `components/Button.tsx` | 4 variants (primary/secondary/ghost/danger), 3 sizes (sm/md/lg), loading spinner, leftIcon/rightIcon, fullWidth, aria-busy |
| `IconButton` | `components/IconButton.tsx` | aria-label required, 3 variants (ghost/subtle/accent), 3 sizes, round/square |
| `Spinner` | `components/Spinner.tsx` | xs/sm/md/lg, role=status, configurable label |
| `Tabs` | `components/Tabs.tsx` | ARIA tablist + tabpanel pattern, full keyboard nav (Arrow/Home/End/Enter/Space), count badges, underline + pill variants |
| `TabPanel` | `components/Tabs.tsx` | Companion panel, lazy rendering, role=tabpanel + aria-labelledby |
| `Tooltip` | `components/Tooltip.tsx` | role=tooltip, aria-hidden when invisible, 4 placements, configurable delay, prefers-reduced-motion |
| `Toast` | `components/Toast.tsx` | aria-live=polite region, 4 variants, auto-dismiss, dismiss button with aria-label, `useToast` hook |
| `ToastProvider` | `components/Toast.tsx` | Wraps app in `App.tsx`; portals toast stack to `document.body` |
| `Toggle` / `Switch` | `components/Toggle.tsx` | role=switch, aria-checked, keyboard (Space), `ToggleField` with `htmlFor`/`id` pairing |
| `Badge` | `components/Badge.tsx` | 5 variants, dot mode, role=status |
| `Counter` | `components/Badge.tsx` | Caps at 99+, aria-label with count |
| `TextInput` | `components/TextInput.tsx` | aria-invalid, aria-describedby for error, CharCounter (aria-live), start/end adornments |
| `TextArea` | `components/TextInput.tsx` | Same as TextInput with resize support |
| `FieldLabel` | `components/TextInput.tsx` | `htmlFor` required pattern |
| `FieldError` | `components/TextInput.tsx` | role=alert, linked to input via aria-describedby |
| `Drawer` | `components/Drawer.tsx` | Focus trap, Escape close, scroll lock, role=dialog, aria-modal, left/right side |

---

## Global Token Additions (tokens.css)

- Shared `@keyframes`: `spin`, `typing-bounce`, `pill-pop`, `fade-in`, `slide-up` — consolidated from per-component inline styles
- `prefers-reduced-motion: reduce` global rule — collapses all animation + transition durations to 0.01ms so all animated components respect the OS setting automatically, without per-component media queries

---

## Accessibility Pass

Changes applied across the app:

| Area | Change |
|---|---|
| `AppShell` | Already had `aria-label` on `<nav>`, all icon-only buttons, theme toggle, compose buttons |
| `PostCard` | Added `aria-label` to the post timestamp button (was icon-only content without label) |
| `ActionBar` | Already had `aria-label` on every action button; no changes needed |
| `Modal` | Already focus-trapped, Escape-closeable, aria-modal=true |
| `ConfirmDialog` | Already role=alertdialog |
| `Drawer` | New — focus trap, keyboard trap, scroll lock, role=dialog |
| `DmComposer` | Already aria-labeled; textarea uses `aria-label="Message text"` |
| `PhotoPage` (Lightbox) | Already role=dialog, aria-modal, close button labeled |
| `ProfileTabs` | Already role=tablist + role=tab + aria-selected |
| `SettingsPage` | All inputs `id`+`htmlFor` wired; selects labeled |
| `Toggle` | New `role=switch` + `aria-checked` (replaces ad-hoc checkbox pattern) |
| `Toast` | New `aria-live="polite"` region for screen reader announcements |
| `Tooltip` | New `role=tooltip` with `aria-hidden` when invisible; `aria-describedby` on trigger |
| `tokens.css` | Global `:focus-visible { box-shadow: var(--shadow-focus) }` already in place from Phase 1; `prefers-reduced-motion` global rule added |
| Color-not-alone | Success/error/warning states all pair color with icon or text (Badge, Toast, FieldError) |

---

## Dockerfile + nginx.conf

### Files
- `frontend/Dockerfile` — multi-stage build
- `frontend/nginx.conf` — SPA config with healthcheck

### Build stages
1. **builder** — `node:22-alpine`, `npm ci`, `npm run build` (accepts `VITE_*` ARGs)
2. **runner** — `nginx:1.27-alpine`, non-root `appuser`, serves `dist/`

### Exposed port
**`8080`** (non-root nginx; no `setcap` needed because >1024)

### Healthcheck
**`GET /healthz`** → `200 OK` `"ok\n"` (plain text, nginx `return` directive — no disk read)

### Build-time env vars (baked into bundle at build)
| Var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `""` | Base URL for API calls; empty = same-origin via Vite proxy |
| `VITE_WS_URL` | `""` | WebSocket server URL; empty = same-origin `/socket.io` |

Pass via `--build-arg VITE_API_BASE_URL=https://api.example.com` at image build time.

### nginx.conf features
- SPA history-API fallback: `try_files $uri $uri/ /index.html`
- `/healthz` 200 OK (no filesystem read)
- `/assets/` — `Cache-Control: public, immutable, max-age=1y` (Vite content-hashed filenames)
- `/` — `no-cache, must-revalidate` so entry point is always fresh
- Security headers: `X-Content-Type-Options`, `X-Frame-Options DENY`, `Referrer-Policy`
- Gzip compression enabled

---

## docker-compose entry (Step 3.5 needs)

```yaml
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_BASE_URL: ${VITE_API_BASE_URL:-}
      VITE_WS_URL: ${VITE_WS_URL:-}
  ports:
    - "8080:8080"
  depends_on:
    backend:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:8080/healthz || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 3
```

---

## Tests Added

| File | Count | What's tested |
|---|---|---|
| `Button.test.tsx` | 13 | All variants, sizes, loading state, leftIcon, fullWidth, onClick |
| `Toast.test.tsx` | 8 | Success/error variants, description, dismiss, aria-live, multiple, provider guard |
| `Toggle.test.tsx` | 10 | aria-checked, onChange (both directions), disabled, Space key, ToggleField label |
| `Tabs.test.tsx` | 11 | All keyboard nav (ArrowLeft/Right/Home/End/Enter), aria-selected, disabled, count badge, TabPanel |
| `Tooltip.test.tsx` | 5 | Children render, DOM presence, aria-hidden default, show on mouseenter, hide on mouseleave |

**Total new tests: 47**
**Running total: 406 / 406 passing**
**Line coverage: 81.93% (gate: 80%)**

---

## Verification Results

```
npm run typecheck   → clean (0 errors)
npm run lint        → clean (0 warnings)
npm test            → 406/406 passing, 39 test files
npm run build       → ✓ built in 336ms
```
