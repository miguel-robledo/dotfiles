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
2. **Rule 2 — prove the tool scan.** Name (a) the mandatory set for this task type,
   (b) any *non-obvious* skill/package/MCP/agent that fits, with the trigger that
   fired it (`TOOLS.md` §2 Skill triggers), and (c) any fitting tool you are
   deliberately skipping, with one line of justification. "None applied" without
   evidence is not acceptable.
3. **Rule 1 — surface the decisions.** Before the first mutating action, list the
   decisions this task forces from the ten classes, batched as questions with
   options and a recommendation. If there are none, say so explicitly.
4. **Rule 3 — arm the watchdog** before the first mutating action (15-minute ping,
   global `WATCHDOG.md`) and state where the findings will be recorded.
5. **OpenSpec.** If this repository has an `openspec/` directory, decide explicitly
   whether the task needs a change proposal, and say why in one line.
