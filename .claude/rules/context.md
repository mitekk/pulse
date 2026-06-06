# Context Window Rules

Applies to all agents and the main session. Every conversation has a finite context window. These rules prevent silent degradation — truncated output, confused state, and wasted work — by requiring proactive monitoring and action at defined thresholds.

---

## Thresholds

| Level | Usage | Required action |
|-------|-------|----------------|
| **Green** | 0–50% | Continue normally |
| **Yellow** | 50–60% | Begin offloading. Summarize completed work to disk. Plan to compact before next major operation. |
| **Orange** | 60–75% | Compact now. Stop new large reads. Write current state to disk. Prefer disk over context. |
| **Red** | 75%+ | Stop new work. Write progress file. Commit. Compact or end session. |

Since token counts are not directly visible, use the heuristics below to estimate your level.

---

## Main Session Heuristics

| Indicator | Level |
|-----------|-------|
| Fresh session, ≤1 agent dispatched | Green |
| 2 agents dispatched OR 5+ large file reads (>200 lines each) | Yellow |
| Parallel agents (Steps 2+3) both returned OR QA dispatched | Orange |
| QA + review + smoke test in same session, or tool calls behaving unexpectedly | Red |

---

## Agent-Level Heuristics

Since agents run with fresh context windows (they do not inherit the main session), each agent should self-assess using these per-type heuristics:

| Agent | Yellow | Orange | Red |
|-------|--------|--------|-----|
| planner | Architecture + API contract written | + ADRs + multiple clarification rounds | Rarely hits |
| backend | 3+ routes + DB schema implemented | Full API + auth + migrations | Full stack + long debug cycles |
| frontend | 3+ pages + state management wired | Full UI + forms + Dockerfile | Extended redesign iterations |
| qa | Unit + integration tests written | + E2E tests + CI workflow | Extended coverage fixing + full codebase re-reads |
| verifier | 3 verification phases complete | All 5 phases complete | N/A |
| committer | Never reaches Yellow | — | — |

---

## Required Actions by Level

### Green
Continue normally. No action needed.

### Yellow
1. Summarize completed work to `docs/<agent>-summary.md` (or `docs/context-summary.md` in the main session).
2. Plan to compact before the next major file read or agent dispatch.
3. Prefer targeted `Read` (specific line ranges) over full-file reads.

### Orange
1. **Compact now** — run `/compact` before dispatching the next agent or reading more files.
2. Stop starting new large reads; work from what is already in context.
3. Write current state to disk before continuing.
4. For the main session: read from `docs/<agent>-summary.md` files rather than holding raw agent outputs in context.

### Red
1. **Stop new work** — do not start new tasks or reads.
2. Write `docs/step-<N>-<agent>-progress.md` (agents) or `docs/context-handoff.md` (main session).
3. Commit all completed files to git.
4. **Do NOT write to `docs/.scaffold-state.json`** — only the main session updates scaffold state.
5. Return with marker: `[PARTIAL COMPLETION — see docs/step-<N>-<agent>-progress.md]`
6. Main session then reads progress files and updates `.scaffold-state.json` atomically.

---

## Agent-Specific Discipline at Yellow+

- Prefer `Read` with line offset/limit over reading entire files.
- Write partial results to disk before reading more files — don't accumulate both in context.
- Write a summary to `docs/<agent-name>-summary.md` **before returning** to the main session. The main session will read the summary instead of holding the raw verbose output.
- At Red: write the progress file listing completed and remaining items, commit, and return partial. The main session re-dispatches a fresh agent with the progress file as context.

---

## Progress File Format

Path: `docs/step-<N>-<agent>-progress.md` (e.g., `docs/step-2-backend-progress.md`, `docs/step-3-frontend-progress.md`)

```markdown
# <Agent> Progress — Step <N>

## Completed
- [x] item 1
- [x] item 2

## Remaining
- [ ] item 3
- [ ] item 4

## Resume Instructions
Re-dispatch with: read this file, skip completed items, continue from remaining items only.
```

---

## Parallel Agent Race Condition Prevention

When parallel agents (e.g., Steps 2 and 3) both hit Red simultaneously:
- **Each agent writes its own scoped progress file** — `step-2-backend-progress.md` and `step-3-frontend-progress.md` — never the same path.
- **Agents never write to `docs/.scaffold-state.json`** directly. The main session merges all progress files and updates scaffold state once, atomically.

---

## Agent Sub-task Decomposition (pre-dispatch)

When the main session estimates that a task scope will push an agent into Red, **decompose into sequential sub-agents** before dispatching. Each sub-agent reads from files the previous one committed — no inline context passing.

| Agent | Decompose when | Sub-task sequence |
|-------|---------------|-------------------|
| backend | >8 endpoints OR 3+ entity types OR complex auth | 1→ DB schema + migrations + models · 2→ Auth routes + middleware · 3→ Business logic routes · 4→ Health endpoint + Dockerfile |
| frontend | >5 pages OR auth + data flows both present | 1→ Routing + layout + auth pages · 2→ API client + shared types · 3→ Feature pages + query hooks · 4→ Forms + Dockerfile |
| qa | Always | 1→ Unit tests · 2→ Integration tests · 3→ E2E tests + CI workflow |

Sub-task handoff: each sub-agent writes `docs/step-<N>-<agent>-subtask-<M>-summary.md`. The next sub-agent's prompt says: "Read that file, then continue with sub-task M+1."

---

## `/compact` vs Context Files

| Tool | When | Purpose |
|------|------|---------|
| `/compact` | Yellow/Orange — session continues | Condenses conversation history in-place. Session stays alive. |
| `docs/context-summary.md` | Red — session ending | Short cross-session handoff: key decisions + next step. |
| `docs/context-handoff.md` | Red + complex scaffold state | Full handoff: scaffold step, PRD version, blockers, agent summaries. |

These are complementary. At Yellow/Orange: compact. At Red: write handoff file, then compact or start a fresh session and read the handoff file.
