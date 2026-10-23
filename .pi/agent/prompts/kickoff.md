---
description: Standard task kickoff — plan first, rules-aware, watchdog armed
argument-hint: "<task description>"
---
$@

---
**Kickoff protocol.** `AGENTS.md` is already loaded — apply it, do not restate it.

1. **Plan before acting.** Stay read-only until the plan is approved. Finish with
   `plan_mode_complete` and a decision-ready plan naming the files, the approach,
   the verification, and every Rule 1 decision the plan depends on.
2. **Rule 2 — scan gate.** `APPEND_SYSTEM.md` already forces the `Scan:` line as
   your first line. In a kickoff, extend it: name the mandatory set per plan step
   and every non-obvious skill/package/MCP/agent that fits, with the trigger that
   fired it. "None applied" without a named reason is not acceptable.
3. **Rule 1 — surface the decisions.** Before the first mutating action, list the
   decisions this task forces from the ten classes, batched as questions with
   options and a recommendation. If there are none, say so explicitly.
4. **Rule 3 — arm the watchdog** before the first mutating action (15-minute ping,
   global `WATCHDOG.md`) and state where the findings will be recorded.
5. **OpenSpec.** If this repository has an `openspec/` directory, decide explicitly
   whether the task needs a change proposal, and say why in one line.
