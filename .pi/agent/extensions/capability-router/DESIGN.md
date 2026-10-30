# Design: capability routing inside the real workflow

Status: proposal, not implemented. Written 2026-10-30 against 14 days of session evidence.

## 1. What the workflow actually looks like (measured)

| fact | value |
|---|---|
| sessions, last 14 days | 80 |
| sessions with exactly **1** user prompt | 51 |
| median user prompts / tool calls per session | 1 / 21 |
| largest session | 1,199 tool calls, 44 prompts |
| sessions with ≥40 tool calls ("big sessions") | 29 |
| big sessions that submitted a plan | 13 |
| plans containing a `## Capabilities` section | 6 (5 genuine, 1 mislabelled) |
| capability rows across those plans | 96 (avg 19 per plan) |
| distinct **named** capabilities the plans chose | ~20 of 119 installed |
| concentration | serena ×8, playwright ×7, systematic-debugging ×3, codebase-memory-mcp ×3, TDD ×3, code-reviewer ×3 |
| primitive rows | 42% (`bash` 18, `write` 12, `edit` 8) |

Conclusion: the capability decision already happens **once per plan**, and it is where the value is. A
prompt-level hint fires once for a run of 21–1,199 tool calls, which is why it cannot matter. The
manual table is dense but converges on a small favourite set — that is the defect worth fixing.

## 2. Defects in the current flow

1. **Prompt-level routing is the wrong altitude.** 51/80 sessions get one hint for a whole run.
2. **The table is hand-written from memory.** ~20 of 119 capabilities ever chosen; the rest are
   invisible unless the model happens to remember them.
3. **The inventory is only reachable by reading a 36 KB document or a 1.7 KB summary.** Fixed: the
   `capabilities` tool exposes 145 entries (78 agents, 61 skills including package skills, 6 MCP) on
   demand, filterable, with descriptions.
4. **The parser cannot tell a capability table from any other table.** 1 of 6 sections is a decision
   matrix (`| Key | Value | Because |`); `plan-audit` reads column 3 with a backtick as a "signature".
5. **Nothing checks conformance during the run.** `plan-audit` reports at the end, so a step that
   declared `mcp:serena/rename_symbol` but ran `bash grep` is only discovered afterwards.
6. **New work has no route.** When a session drifts into an unplanned area (a Figma diff, a Moodle
   plugin), no capability is suggested for it.

## 3. Target workflow

```
/plan  ──► model drafts the plan
             └─ plan_mode_complete is intercepted:
                  • steps extracted from numbered headings
                  • each step classified against all 119 capabilities (parallel, ~1.2 s total)
                  • canonical `## Capabilities` block written/verified   ← P1
/kickoff ─► run starts: static capability map + the verified table
             └─ conformance checks each turn (local, no model calls):
                  • declared family not used for a step that just ran → one corrective line
                  • work outside the plan → one classify call → "new task" hint      ← P2
end      ─► one artifact: declared vs observed vs ever-used coverage              ← P4
```

Three attachments, all reusing the same index and classifier:

| when | what fires | model calls | why it is the right place |
|---|---|---|---|
| every run | static capability map (exists today) | 0 | the only thing that reaches the middle of a long run |
| plan commit | capability table generation + verification | N parallel, ~1.2 s | the decision point the workflow already has |
| each turn | conformance + drift detection | 0 normally, 1 per new-work event | correction happens while it is still changeable |

The per-prompt planner + classify pipeline built today is **demoted**: one classify call on a follow-up
prompt (the fix-up prompts in messy sessions), no projector rewrite. It stays because 29 sessions have
11–44 prompts, which is exactly where corrections happen.

## 4. Proposed changes to the workflow documents

### kickoff.md — the read stays, and gets more direct

**Do not remove the `TOOLS.md` read.** Reading the setup is what causes usage; the failure mode to
avoid is an agent that plans from a compressed summary and forgets 100 of the 145 capabilities.
Step 1 keeps requiring `TOOLS.md` §2–§5.

Add one line to step 1:

> The `capabilities` tool returns the same inventory on demand (filterable by kind, with descriptions).
> Prefer it over memory when you need a capability mid-run; `TOOLS.md` remains the required planning read.

Keep the rest of the protocol: table shape, selection order, `Rejected:` line. Add one rule so the
conformance check can parse reliably: rows are `| Step | Capability | Why |` only, and the table lives
under `## Capabilities` — no other table under that heading.

### AGENTS.md, Rule 2

Keep the hand-maintained trigger table: it is a summary, and summaries plus a mandatory read are what
made the current workflow work. Add a pointer, do not replace:

> The full installed inventory is also callable mid-run: the `capabilities` tool (`kind`, `detail`,
> `query`). `TOOLS.md` §2 remains the required planning read.

### TOOLS.md

Unchanged in role: still the catalogue the agent must read before planning. Add one heading note that
`capabilities` (tool) and `/capabilities` (human) expose the same inventory, so the two cannot drift.

### plan-audit

Fold into `capability-router` as its conformance engine (same parser, one artifact, one log), or keep
it separate and have the router call its parser. Two extensions producing two reports about the same
plan is the kind of duplication that decays.

## 5. Phases

| phase | scope | acceptance | cost |
|---|---|---|---|
| P0 ✅ | canonical table format + strict parser (`## Capabilities` section only), shared with `plan-audit` | 5/5 genuine tables parse, 1/1 decision matrix rejected | none at runtime |
| P1 ✅ | plan-commit review: extract steps, classify in parallel, send findings for the model to rewrite the table | 10-step plan with no table gets 10 rows in ≤2 s; an existing table gets flags where another capability scores ≥2× the declared one | ~1.2 s once per plan |
| P2 | per-turn conformance (local) + new-work detection | fixture run: one corrective line when a declared `mcp:serena` step ran as `bash grep`; zero lines on a clean run; ≤3 lines per session | 0–1 calls per new-work event |
| P3 | workflow docs (`kickoff.md`, `AGENTS.md` Rule 2, `TOOLS.md` framing) | `/kickoff` run no longer reads `TOOLS.md` and still produces a table | none |
| P4 | measurement: declared-vs-used rate per plan, coverage over time | report shows both, per plan and per 14-day window | none |

## 6. Guardrails

- **Noise budget**: ≤3 corrective lines per session, ≤1 per 5 turns; never repeat a correction.
- **No blocking**: conformance advises; it never blocks a tool call (that is the permission system's job).
- **Cost**: plan commit ~1.2 s; mid-run checks are local string comparisons; drift detection ≤1 call.
- **Failure mode**: classifier down → plan-time falls back to the step text and emits nothing; the run is
  never delayed beyond the 8 s classifier timeout.
- **Trust boundary**: project brief (file names, changed files) goes to Ollama cloud, as the session
  model already does. No file contents are sent, only names from the brief.

## 7. Open decisions

1. May the router **write into the plan** at commit (additive `## Capabilities` block), or must it emit
   a separate advisory message the human applies?
2. Conformance style: advisory line, hard gate, or end-of-run report only?
3. Phase scope for the next sitting: P0–P1, P0–P2, or all five.
