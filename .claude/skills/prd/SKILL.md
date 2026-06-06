---
name: prd
description: |
  Transforms raw requirements (markdown, PDF, plain text, or mixed formats) into a
  structured, versioned PRD snapshot ready for the scaffold workflow. Use this skill
  whenever the user provides specs, a brief, a PDF, or raw feature requirements and
  wants to prepare for /scaffold. Creates docs/prd/PRD-vN.md, updates
  docs/prd/PRD-current.md, docs/prd/README.md, and docs/.scaffold-state.json.

  Trigger on: "create a prd", "process these requirements", "here's the spec",
  "prepare for scaffold", "/prd", "i have requirements to turn into a PRD",
  handed any document with feature requirements, or any time the user wants to
  capture or update requirements before running /scaffold. Also trigger when the
  user says "here are the requirements" or "here's what we need to build" even
  without explicitly mentioning a PRD.
---

# PRD Intake

This skill turns raw or loosely-structured requirements into a well-formed PRD
that the scaffold workflow can consume without ambiguity. A good PRD here means:
the planner agent can answer its five intake questions directly from the document,
backend and frontend agents have enough context to work independently, and the QA
agent knows what to test.

---

## Phase 1 — Ingest requirements

Read everything the user has provided:

- **File paths**: use the Read tool. Claude Code natively reads `.md`, `.txt`, and
  `.pdf` files. Read all provided files before doing anything else.
- **Inline text**: treat the user's message body as the source if no files given.
- **Multiple sources**: read all of them; synthesize in Phase 3.
- **Existing codebase**: if the user mentions existing code or this is a brownfield
  project, use an Explore subagent to understand current structure, tech stack, and
  constraints. That context belongs in the PRD's "Existing Codebase" section.

Don't start writing yet — understand the full scope first.

---

## Phase 2 — Gap analysis (ask, don't assume)

Before drafting, identify missing information that would force the planner to make
assumptions during `/scaffold`. The planner needs answers to five questions; fill in
what the requirements already answer and ask only about genuine gaps:

1. **Auth** — Who are the users? Any roles or permissions needed?
2. **Real-time** — Does any feature need live updates (websockets, SSE, polling)?
3. **Database** — PostgreSQL or MongoDB preference? Any schema constraints?
4. **Caching** — Any high-read data that would benefit from Redis?
5. **Existing code** — Is there a codebase to integrate with or extend?

Keep this to at most 3 questions per round. If the requirements clearly cover most
of these, skip to Phase 3. The goal is to fill gaps, not to conduct a full
interview when the spec is already detailed.

---

## Phase 3 — Draft the PRD

Write a structured PRD using the template below. Fill every section — "N/A" is
acceptable only for sections genuinely not applicable (e.g., "Existing Codebase"
for a greenfield project). Vague sections are bugs; the scaffold agents will make
assumptions to fill them, and those assumptions rarely match intent.

```
# PRD: [Project Name]

## Overview
One paragraph: what this product does, who it's for, and the primary value it delivers.

## Problem Statement
What problem does this solve? Why does it matter to the users?

## Users & Roles
List user types and their key permissions/capabilities. Be explicit about what
each role can and cannot do.

## Functional Requirements
Group by feature area. Number each requirement (FR-1, FR-2, …).
Write what the system does, not how it does it.

Example:
### Authentication
- FR-1: Users can register with email and password.
- FR-2: Users can log in and receive a session token valid for 7 days.
- FR-3: Admins can deactivate any user account.

### [Next Feature Area]
- FR-N: ...

## Non-Functional Requirements
Performance, availability, security, scalability constraints.
Be specific — "API p95 < 200ms under 1,000 concurrent users" beats "fast".
Include rate limits, uptime targets, data retention rules.

## Tech Constraints
Stack preferences, must-use libraries, deployment target, existing services.
Include: auth mechanism (JWT/session/OAuth), DB choice, cache needs, real-time needs,
any third-party APIs that must be integrated.

## Existing Codebase (if applicable)
What exists, what must be preserved, what integration points matter.
List current tech stack if known.

## Out of Scope
Explicitly list what is NOT being built in this version. This prevents scope creep
and gives the planner clear boundaries.

## Open Questions
Unresolved items that could affect architecture. Mark blockers explicitly.
These get resolved in planner intake (Step 1 of /scaffold).

## Definition of Done
What does "shipped" mean for this PRD? Reference the project DoD and scope it:
- Which user flows must be demonstrable end-to-end?
- What test coverage is expected?
- Any specific performance benchmarks to hit?
```

---

## Phase 4 — Present and confirm

Show the drafted PRD to the user. Ask for a review before writing any files:

> "Here's the PRD based on your requirements. Take a look — does this capture
> everything correctly? Any sections to adjust before I write the files?"

Wait for confirmation. Iterate on feedback. This is the cheapest moment to fix
misunderstandings — before scaffold generates thousands of lines of code across
multiple agents.

---

## Phase 5 — Determine version number

Before writing, check what already exists:

1. Read `docs/.scaffold-state.json` → get current `prd_version`
2. Glob `docs/prd/PRD-v*.md` → find the highest existing version number
3. New version = highest + 1 (e.g., v1 exists → write v2)

For a fresh project with only the v0 placeholder, the new version is v1.

Never overwrite an existing `PRD-vN.md` — each version is an immutable record.
If v1 already exists and the user is updating requirements, write v2.

---

## Phase 6 — Write the files

Write all four files atomically (one after the other, no partial writes):

### 1. `docs/prd/PRD-vN.md`
Full PRD content confirmed in Phase 4. This is the canonical, immutable record of
this version's requirements. Never modify it after writing.

### 2. `docs/prd/PRD-current.md`
Replace the entire file with the same content as PRD-vN.md. This is what `/scaffold`
and `/resume` read — it must hold full PRD text, not a pointer or symlink.

### 3. `docs/prd/README.md`
Append a new row to the version table. Preserve all existing rows.

```
| vN | YYYY-MM-DD | One-line summary of what changed or what this PRD covers |
```

### 4. `docs/.scaffold-state.json`
Two cases:

**Case A — Existing workflow in progress** (status is `in_progress` or `blocked`
with real step progress, i.e., `last_completed_step > 0`):
Update only `prd_version`, `prd_path`, and `updated_at`. Leave step progress intact.
This handles mid-workflow requirement updates.

```json
{
  "prd_version": "vN",
  "prd_path": "docs/prd/PRD-current.md",
  "updated_at": "<current UTC ISO-8601 timestamp>"
}
```

**Case B — Fresh start** (file missing, or `last_completed_step == 0`, or blocked
only by the placeholder blocker "Workflow not initialized"):
Reset to a clean initialized state ready for Step 1:

```json
{
  "workflow": "scaffold",
  "schema_version": 1,
  "status": "in_progress",
  "last_completed_step": 0,
  "next_step": 1,
  "updated_at": "<current UTC ISO-8601 timestamp>",
  "blockers": [],
  "prd_version": "vN",
  "prd_path": "docs/prd/PRD-current.md",
  "parallel_pending_steps": []
}
```

---

## Phase 7 — Hand off

Tell the user what was written:
- `docs/prd/PRD-vN.md` — new versioned PRD
- `docs/prd/PRD-current.md` — updated to current version
- `docs/prd/README.md` — version table updated
- `docs/.scaffold-state.json` — `prd_version` set to vN

Then say: "You're ready to run `/scaffold` to start the build."

Offer a commit checkpoint:
> "Want me to commit this? Message would be: `docs: add PRD vN requirements snapshot`"

Don't auto-commit — wait for the user to confirm or use `/commit`.

---

## Key principles

**Don't architect — document.** This skill captures requirements; it doesn't make
technical decisions. If requirements imply an architecture choice (e.g., "we need
sub-100ms latency" → Redis), note it as a constraint in "Tech Constraints" and let
the planner decide the implementation. Blurring this line leads to plans that don't
match the requirements.

**PRD-current.md holds content, not a pointer.** The scaffold and resume skills read
this file with the Read tool expecting full PRD text. A one-liner pointing elsewhere
breaks the workflow.

**Version history is sacred.** The `/resume` skill reasons about what was planned
at a given step by reading the PRD version. Overwriting a version breaks that
reasoning. Always increment.

**PDF and multi-file support.** The Read tool handles PDFs natively. For a folder
of requirement files, read them all and synthesize — don't ask the user to merge
them manually.
