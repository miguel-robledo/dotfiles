---
description: Standard task kickoff — capability inventory first, plan second, rules-aware
argument-hint: "<task description>"
---
$@

---
**Kickoff protocol.** `AGENTS.md` is already loaded — apply it, do not restate it.

1. **Capability inventory before the plan.** Read `TOOLS.md` §2–§5: §2 is the
   trigger table, §3 packages, §4 MCP servers, §5 the full agent roster (the
   advertised subagent list is capped and is not the roster). Skills need no read —
   they are listed in your prompt. Build the plan *out of* what is there: the
   inventory decides which approaches exist, not the other way round. Stay
   read-only until the plan is approved.
2. **The plan carries a `## Capabilities` table.** One row per plan step, naming
   the skill / tool / package / agent that executes it, and why that one:

   | Step | Capability | Why |
   |---|---|---|
   | map callers | `cbm` `trace_path` | 3-hop traversal; LSP sees one hop |
   | rename | `serena` `rename_symbol` | LSP-precise, atomic |
   | verify | `subagent` `reviewer` | blackbox, no impl context |

   Then one line of rejected candidates: `Rejected: ponytail-audit — repo-wide,
   out of scope.` There is no line budget: a long plan gets a long table. A step
   may run on nothing only with a reason; "nothing fit" without a named candidate
   is not acceptable.
3. **Rule 1 — surface the decisions.** Before the first mutating action, list the
   decisions this task forces from the ten classes, batched as questions with
   options and a recommendation. If there are none, say so explicitly.
4. **Rule 3 — arm the watchdog** before the first mutating action (15-minute ping,
   global `WATCHDOG.md`) and state where the findings will be recorded.
5. **OpenSpec.** If this repository has an `openspec/` directory, decide explicitly
   whether the task needs a change proposal, and say why in one line.

Do not call `plan_mode_complete` until the `## Capabilities` table exists and
covers every step of the plan.
