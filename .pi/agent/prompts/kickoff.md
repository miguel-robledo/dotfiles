---
description: Standard task kickoff — capability inventory first, fit-based plan, rules-aware
argument-hint: "<task description>"
---
$@

---
**Kickoff protocol.** `AGENTS.md` is already loaded — apply it, do not restate it.

1. **Capability inventory before the plan.** Read `TOOLS.md` §2–§5: §2 is the
   trigger table, §3 packages, §4 MCP servers, §5 the full agent roster (the
   advertised subagent list is capped and is not the roster). Skills need no read —
   they are listed in your prompt. Stay read-only until the plan is approved.
2. **The plan carries a `## Capabilities` table.** One row per plan step. The
   `Capability` cell is a single backticked signature, so the plan can be checked
   against what actually ran:

   | Step | Capability | Why |
   |---|---|---|
   | map callers | `mcp:codebase-memory-mcp/trace_path` | 3-hop traversal; LSP sees one hop |
   | rename | `mcp:serena/rename_symbol` | LSP-precise, atomic |
   | verify | `subagent:reviewer` | blackbox, no impl context |
   | read config | `read` | one file, no structure involved |

   Signatures: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`,
   `mcp:<server>/<tool>`, `subagent:<agent>`, `skill:<name>`, `none`.

   **Selection order — stop at the first capability that fully does the step:**
   `read`/`bash` inline → `mcp:<server>/<tool>` for symbol-precise or structural
   work → `skill:<name>` when a process applies → `subagent:<agent>` when the work
   needs independent context. A step whose nature matches a §2 trigger **must** use
   that capability; that is a rule, not a preference. A step matching no trigger
   uses the smallest capability and needs no justification. Anything above the
   smallest needs a `Why`.

   Then one line of rejected candidates: `Rejected: ponytail-audit — repo-wide,
   out of scope.` Name every larger capability that was a real candidate for a step.
3. **Rule 1 — surface the decisions.** Before the first mutating action, list the
   decisions this task forces from the ten classes, batched as questions with
   options and a recommendation. If there are none, say so explicitly.
4. **Rule 3 — arm the watchdog** before the first mutating action (15-minute ping,
   global `WATCHDOG.md`) and state where the findings will be recorded.
5. **OpenSpec.** If this repository has an `openspec/` directory, decide explicitly
   whether the task needs a change proposal, and say why in one line.

Do not call `plan_mode_complete` until the `## Capabilities` table exists, every row
carries a valid signature, and every §2 trigger that fired is represented.
`/plan-audit` compares this table with the tool calls that actually ran.
