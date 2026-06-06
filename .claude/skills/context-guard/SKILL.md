---
name: context-guard
description: |
  Monitor and optimize context window usage in the main session and agents. Use this skill
  proactively — before dispatching any heavy agent (planner, backend, frontend, qa), at scaffold
  workflow checkpoints (after Step 1, after Steps 2+3, before QA, before smoke test), after
  receiving verbose agent results, or whenever the session feels long. Also trigger on phrases
  like "context", "tokens", "compact", "running low", "running out of space", or "context window".
  Invoke even if you think things are fine — the audit is fast and prevents silent degradation.
---

# Context Guard

Context windows accumulate silently until things break. This skill runs a fast audit of the current session, assigns a health level, and gives you the exact action to take — before you hit a limit mid-task.

The universal rules live in `.claude/rules/context.md`. This skill is the action layer: audit → level → execute.

---

## Phase 1 — Audit

Run through this checklist to estimate context level:

**Main session signals:**
- [ ] How many agents have been dispatched this session?
- [ ] How many large files (>200 lines) have been read this session?
- [ ] Are parallel agents (Steps 2+3) both completed and their results returned?
- [ ] Has QA been dispatched?
- [ ] Has the smoke test run?
- [ ] Are tool calls behaving unexpectedly or responses feeling truncated?

**Assign level:**

| Signals present | Level |
|----------------|-------|
| ≤1 agent dispatched, few file reads | 🟢 Green |
| 2 agents dispatched OR 5+ large reads | 🟡 Yellow |
| Parallel agents both returned OR QA dispatched | 🟠 Orange |
| QA + smoke + review in same session, or artifacts of truncation | 🔴 Red |

Output the level clearly: `Context level: 🟡 Yellow — 2 agents dispatched, large file reads`

---

## Phase 2 — Recommend

Based on level, output the exact next action:

| Level | Action |
|-------|--------|
| 🟢 Green | "All clear — continue." |
| 🟡 Yellow | "Summarize key decisions to `docs/context-summary.md`. Plan to compact before the next agent dispatch or large read." |
| 🟠 Orange | "Run `/compact` now before dispatching the next agent. Read from summary files rather than holding agent outputs in context." |
| 🔴 Red | "Stop new work. Write `docs/context-handoff.md`. Run `/compact` or end this session and resume with `/resume`." |

---

## Phase 3 — Execute

### At Yellow: write context summary

Save to `docs/context-summary.md`:

```markdown
# Context Summary — [timestamp]

## Workflow State
- Scaffold step: [current step, e.g., "After Step 1 — about to dispatch Steps 2+3"]
- PRD version: [from docs/.scaffold-state.json]
- Status: [in_progress / blocked]

## Key Decisions Made This Session
- [Decision 1]
- [Decision 2]

## Open Issues / Blockers
- [Issue 1, or "None"]

## Next Action
- [Exact next command, e.g., "Dispatch backend + frontend agents in parallel via superpowers:dispatching-parallel-agents"]
```

### At Orange: compact + read summaries

1. Run `/compact`
2. After compaction, read from `docs/backend-summary.md` and `docs/frontend-summary.md` (if written by agents) instead of re-loading raw outputs
3. Continue with reduced context footprint

### At Red: write handoff + end session

Save to `docs/context-handoff.md`:

```markdown
# Context Handoff — [timestamp]

## Session State
- Scaffold step: [step number and name]
- PRD version: [vN]
- PRD path: docs/prd/PRD-current.md
- Status: [in_progress / blocked]
- Blockers: [list or "None"]

## Completed This Session
- [List of completed steps/agents]

## In Progress (partial)
- [Agent/step that was in progress — reference progress file if one was written]

## Agent Summary Files Written
- docs/backend-summary.md: [yes/no — brief note]
- docs/frontend-summary.md: [yes/no — brief note]

## Resuming
1. Run `/resume` — reads docs/.scaffold-state.json for exact re-entry point
2. Reference this file for session context that isn't in the state file
3. If a progress file exists, include it in the re-dispatch prompt
```

Then run `/compact` or end the session. To resume: `claude` → `/resume` → read `docs/context-handoff.md`.

---

## Phase 4 — Pre-Dispatch Estimation

Before dispatching a heavy agent, estimate whether it will hit Red mid-task:

1. Count endpoints in `docs/api-contract.md` (backend scope)
2. Count pages in `docs/architecture.md` (frontend scope)
3. Apply decomposition triggers from `.claude/rules/context.md`

| Agent | Decompose when |
|-------|---------------|
| backend | >8 endpoints OR 3+ entity types OR complex auth |
| frontend | >5 pages OR both auth + data flows present |
| qa | Always split: unit → integration → E2E |

If decomposition is needed: dispatch sequential sub-agents. Each reads from the files the previous one committed.

---

## Phase 5 — Post-Agent Compaction

After a heavy agent returns to the main session:

1. Check if agent wrote `docs/<agent>-summary.md` — if so, read it instead of holding the full raw output
2. If the agent did not write a summary, create one now from its output
3. If now at Yellow or above: run `/compact` before proceeding

---

## Scaffold Checkpoints Reference

This skill is automatically referenced at these scaffold steps. You can invoke it explicitly at any point.

| Checkpoint | Typical level | Action |
|-----------|---------------|--------|
| After Step 1 (Planner) | Yellow | Compact before parallel dispatch. Check endpoint/page counts for decomposition. |
| After Steps 2+3 both return | Orange | Compact. Read from summary files. |
| Before Step 5 (QA) | Orange | Compact. Consider decomposing QA into sequential sub-tasks. |
| Before Step 5.7 (Smoke test) | Red candidate | Full audit. Write handoff if Red before proceeding. |
