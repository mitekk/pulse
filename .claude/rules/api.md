# API Rules

Applies to all REST API design and implementation.

## URL Conventions

- Plural nouns for resources: `/users`, `/orders`, `/products`
- Kebab-case for multi-word segments: `/user-profiles`, not `/userProfiles`
- Version prefix from day one: `/api/v1/...`
- Resource nesting max 2 levels: `/api/v1/users/:id/orders` — stop there; deeper nesting signals a missing resource
- No verbs in paths: `/api/v1/users/:id/activate` → `POST /api/v1/users/:id/activation`

## HTTP Verbs & Status Codes

| Operation | Verb | Success | Notes |
|-----------|------|---------|-------|
| List | GET | 200 | Always paginated |
| Get one | GET | 200 | 404 if not found |
| Create | POST | 201 | Return the created resource |
| Full update | PUT | 200 | Idempotent |
| Partial update | PATCH | 200 | Only send changed fields |
| Delete | DELETE | 204 | No body |

Common errors:
- 400 Bad Request — validation failed (include field errors)
- 401 Unauthorized — missing or invalid auth token
- 403 Forbidden — authenticated but lacks permission
- 404 Not Found — resource does not exist
- 409 Conflict — duplicate resource, optimistic lock failure
- 422 Unprocessable Entity — semantically invalid input
- 429 Too Many Requests — rate limit exceeded
- 500 Internal Server Error — unexpected; never expose details

## Error Response Shape

All errors use a consistent envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Must be a valid email address" }
    ]
  }
}
```

- `code`: machine-readable constant (SCREAMING_SNAKE_CASE)
- `message`: human-readable summary
- `details`: optional array for field-level errors (validation)
- Never include stack traces, internal paths, or DB error messages

## Pagination

Default to offset-based pagination for simplicity:

```
GET /api/v1/users?page=1&limit=20
```

Response envelope:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

Use cursor-based pagination when:
- Dataset is large (>100k rows) and offset becomes slow
- Real-time feeds where items can be inserted between pages

Cursor response:
```json
{
  "data": [...],
  "cursor": { "next": "eyJpZCI6MTAwfQ==", "hasMore": true }
}
```

Default limit: 20. Max limit: 100. Never return unbounded lists.

## Request/Response Conventions

- All timestamps: ISO 8601 UTC (`2024-01-15T10:30:00Z`)
- All IDs: strings (UUID or CUID), not integers — avoids enumeration attacks
- Booleans: `true`/`false`, never `1`/`0` or `"yes"`/`"no"`
- Null fields: include them explicitly in responses (don't omit)
- Dates without time: `YYYY-MM-DD` string, not a timestamp

## API Contract Artifact

Every project must have an API contract table. Produce this alongside the architecture plan (planner responsibility):

```
| Method | Path | Request Body | Response Body | Auth? |
|--------|------|--------------|---------------|-------|
| POST   | /api/v1/auth/register | { email, password, name } | { user, token } | No |
| POST   | /api/v1/auth/login | { email, password } | { user, token } | No |
| GET    | /api/v1/users/me | — | { user } | Yes |
```

This table is the source of truth for frontend and QA agents. Update it when routes change.

## OpenAPI / Documentation

For Node.js: use `@fastify/swagger` or `zod-to-openapi` to auto-generate from schemas.
For Python: FastAPI generates OpenAPI docs automatically at `/docs`.

Minimum requirement: the API contract table above. Generated OpenAPI is a [NICE] enhancement.
