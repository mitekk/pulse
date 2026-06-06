---
name: adr
description: Document an architecture decision as a MADR file. Use when a significant technical decision has been made — stack selection, auth strategy, DB choice, state management, API versioning, or any choice where 2+ alternatives existed and the decision has lasting codebase consequences. Callable at any point in the workflow, not only during scaffold. Triggers on "document this decision", "write an ADR", "record why we chose", "architecture decision record", or after any significant technical choice.
---

# /adr

Creates a MADR-format Architecture Decision Record and updates the index. Delegates to the `adr` agent.

## When to use

- After any significant technical choice with 2+ viable alternatives
- After `/plan` — to document stack, DB, auth, state management, and API versioning decisions
- After backend or frontend implementation — to document key implementation choices
- Anytime mid-session when a notable decision is made outside the scaffold flow

## What this produces

- `docs/adr/NNNN-kebab-case-title.md` — the MADR-format record
- Updated `docs/adr/README.md` — index table with new entry

## Execution

Delegate to the `adr` agent with the following context:

1. **Topic** — use the argument passed to `/adr` (e.g., `/adr auth strategy`) or infer from recent conversation context
2. **Check existing ADRs** — read `docs/adr/README.md` to find the next sequential number
3. **Identify the decision** — what was chosen, what alternatives were rejected, and why
4. **Write the ADR** per the MADR format defined in `adr.md` agent
5. **Update the index** — add a row to `docs/adr/README.md`

## Usage examples

```
/adr                          # infer decision topic from session context
/adr auth strategy            # document the authentication approach
/adr database selection       # document PostgreSQL vs MongoDB choice
/adr frontend state management
```

## Minimum ADRs per project

Every project must have ADRs for:
1. Stack selection (language, framework, runtime)
2. Database choice (engine, schema approach)
3. Auth strategy (mechanism, token storage)
4. Frontend state management approach
5. API versioning strategy

These are created during scaffold Steps 1–3. Use `/adr` to create any that were skipped or to add new ones post-hoc.

## Notes

- Does not modify `docs/.scaffold-state.json` — purely documentary
- If `docs/adr/` does not exist, create it before writing the first ADR
- Number sequentially from `0001`; check existing files before assigning a number
