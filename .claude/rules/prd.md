# PRD Rules

Applies to all agents and sessions that touch `docs/prd/` or `docs/.scaffold-state.json`.

## Source of Truth

`docs/prd/PRD-current.md` is always the active PRD. It contains the full PRD text
(not a pointer). Read it when you need requirements context. Never modify it directly
— use `/prd` to create a new version, which updates it atomically alongside the
version history and state file.

## Versioning is immutable

`docs/prd/PRD-vN.md` files are permanent records. Once written, never overwrite,
edit, or delete them. If requirements change mid-workflow, run `/prd` to create a
new version (v2, v3, …) and let it update PRD-current.md.

## State file fields

`docs/.scaffold-state.json` tracks `prd_version` and `prd_path`. These are set by
`/prd` and should not be changed manually. `prd_path` is always
`"docs/prd/PRD-current.md"` — never a versioned path like `"docs/prd/PRD-v1.md"`.

## When requirements are unclear mid-scaffold

Check `PRD-current.md` first. If it's genuinely ambiguous, surface the open question
in your output rather than guessing. Do not modify the PRD yourself — that's the
user's responsibility via `/prd`.
