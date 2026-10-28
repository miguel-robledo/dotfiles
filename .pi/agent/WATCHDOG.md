# Watchdog — standing self-review checklist

Referenced by **Rule 3** in `AGENTS.md`. Read it with the global rules and the
project's own `AGENTS.md`.

The Rule 3 ping arms a background task that wakes the agent every ~15 minutes
while multi-step work is in flight. On every wake-up, answer the four questions
below **in writing and briefly** — a clean review is one line. This is not a
summary of progress; it is an adversarial check of the agent's own work while
the work is still changeable.

## 1. Tools

- Did I use the skill that fits this task, or did I improvise my own approach?
- Ponytail before new code? CBM for structural questions? Serena for symbol
  edits plus `get_diagnostics_for_file` to close the loop?
- `find-docs` for any library/API/config question, instead of recalling from
  training data?
- Did I dispatch subagents where Rule 4 authorises it — and load the relevant
  skill before dispatching, passing distilled guidance and exact tool names?
- Is every fitting tool I skipped justified in one line, with evidence? "None
  applied" with no evidence is a finding.
- Did I invent a tool I do not have? State the gap instead of pretending.

## 2. Rule 1 — did I ask?

Walk the ten classes (architecture; stack and dependencies; public contracts;
data and persistence; security, access, secrets; cost and quota; blast radius
and reversibility; workflow and conventions; product semantics; scope).

- Did I decide anything in any of those classes without asking? That is a
  finding, regardless of whether the decision turned out right.
- Did I state a silent default in one line instead of asking?
- Did I ask *before* the first mutating action in that area, or only after the
  work existed?
- Anything I would have written as "I assumed…" — surface it now.

## 3. Claims versus evidence

- Every "passed", "green", "fixed", "verified", "done" must be backed by the
  actual output in the transcript. A claim without output is a blocker, not a
  finding.
- Test expectations must come from real fixtures/payloads, never invented
  numbers.
- Watch for narrated-but-unperformed checks — describing a verification instead
  of running it is the single most damaging failure mode this checklist exists
  for.
- Did a quality gate pass for the wrong reason? (e.g. a grep-count gate whose
  match was in printed type text, not an error path).

## 4. Scope

- Did I drift past the request — extra refactor, extra file, extra feature?
- Did I silently drop something that was asked for?
- Does the work still map to the plan or the user's words? Flag scope that is
  not covered by either.

## Recording findings

Write to `.pi/watchdog/REVIEW-<YYYY-MM-DDTHHMM>.md` in the project you are
working in (or `~/.pi/agent/watchdog/` when there is no project), containing:

- what was checked,
- the evidence (command + output, file:line, or transcript reference),
- severity (blocker / finding / note),
- the recommended action.

Keep it short. A clean review is one line.

## False-alarm guard

**Verify against git before treating any alert as a finding.** Branch switches
produce phantom differences: a past alert that `login.ts` had been reverted was
only an inter-branch diff. Check `git status`, `git log`, and `git ls-tree`
against the real baseline before believing a diff-based alert.

Never undo work on a watchdog alert alone.

## Arming and disarming

- **Arm** at task start for multi-step or mutating work, before the first
  substantive action: `bg_run` with a ~900-second sleep and the watchdog
  payload, `isAgent: false`, notifications enabled.
- Each ping is one armed sleep. When it fires: answer the four questions, record
  what you found, then **re-arm** if the task is still running.
- **Disarm** when the task ends or the user says stop. Report anything left
  unresolved.

## Project checklist additions

A project may extend this list in its own `.pi/WATCHDOG.md` (for example the
`picker` project adds data-etiquette rules: sequential cached requests, no retry
storms, no crash without network, plus its locked dependency set). Project
additions apply on top of this file — they add, they do not replace.
