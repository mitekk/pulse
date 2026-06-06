---
name: commit
description: Stage completed work and create a meaningful conventional commit. Use after finishing any logical chunk of work — a feature, bug fix, scaffold step, or configuration change. Delegates to the committer agent (Haiku). Project-aware: knows the scaffold checkpoint commit sequence. Triggers on "commit", "commit this", "save progress", "checkpoint", "create a commit", or after completing a significant implementation step.
---

# /commit

Creates a clean, informative git commit for the current working changes. Delegates to the `committer` agent.

## When to use

- After completing any logical unit of work (feature, fix, docs, tests, config)
- At scaffold workflow checkpoints (Step 1 docs, Step 2 backend, Step 3 frontend, Step 5 tests, Step 6 ship)
- Anytime you want to save a recoverable checkpoint outside the scaffold flow

## What this does

1. Runs `git status` + `git diff` to understand what changed
2. Checks for dangerous files (`.env`, secrets, build artifacts, `node_modules`) — flags any found
3. Stages appropriate files by path pattern (never `git add .` blindly)
4. Drafts a Conventional Commits message with a meaningful body
5. Shows staged files and message, then commits

## Scaffold checkpoint sequence

When called during the scaffold workflow, use this commit sequence:

| Step | Commit message pattern |
|------|----------------------|
| Step 1 (planner) | `docs: add architecture plan and API contract` |
| Step 2 (backend) | `feat(backend): <what was implemented>` |
| Step 3 (frontend) | `feat(frontend): <what was implemented>` |
| Step 4 (review fixes) | `fix: address static review findings` |
| Step 5 (QA) | `test: add test suite and CI workflow` |
| Step 5.5 (review fixes) | `fix: address full review findings` |
| Step 5.9 (smoke fixes) | `fix: address smoke test findings` |
| Step 6 (ship) | `chore: verify ship — tests green, docs complete` |

Always include `docs/.scaffold-state.json` in scaffold checkpoint commits so `/resume` remains deterministic.

## Never stage

`.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, `dist/`, `build/`, `__pycache__/`, `node_modules/`, `coverage/`, `playwright-report/`

## Notes

- The `committer` agent runs on Haiku (fast, lightweight — appropriate for structured commit tasks)
- If `.gitignore` is missing entries for build artifacts or env files, add them as part of the commit
- Atomic commits: one logical unit per commit. Don't mix backend + frontend in one commit
