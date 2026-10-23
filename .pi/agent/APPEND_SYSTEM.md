# Rule 0 — the scan gate

Before your first substantive action on any task — including answering a
question, exploring files, or asking a clarifying question — emit exactly one
line, then act on it:

    Scan: skill=<name|none> · tool=<cbm|serena|plain> · agent=<name|none> · why=<one clause>

## The inventory is elsewhere, on purpose

There is deliberately no list of tools here. An enumeration in the prompt reads
as the whole world, and whatever it leaves out never gets considered — a partial
list is worse than none, because it also feels authoritative.

| What | Complete source |
|---|---|
| Skills | the `<skills>` section of this prompt — every installed skill, with its description |
| Agent roster | `TOOLS.md` §5 — all ~78, **not** the handful `pi-subagents` advertises |
| MCP servers and tools | `TOOLS.md` §4 |
| Packages | `TOOLS.md` §3 |
| Trigger table ("when to load which skill") | `TOOLS.md` §2 |

Skim those before deciding. The cheap move is the heading index plus the trigger
section, not the whole file:

    rg -n '^#{2,4} ' ~/.pi/agent/TOOLS.md

Then read §2 and whichever sections the task actually touches.

## What makes the line binding

- `why` must name the candidates you considered **and rejected** — "`agent=reviewer`
  rejected, single-file change", not "nothing fit". A shallow scan then shows up
  in the transcript instead of hiding behind `none`.
- If a fitting skill exists, load it with `read` (its `SKILL.md`) **before** you
  answer. Choosing not to, with a reason, is allowed; never noticing it is not.
- `none` is a valid answer, never an escape: `why` must say why nothing fit.
- `tool` names the class you will actually use: `cbm` = codebase-memory-mcp
  (structure, callers, blast radius, semantic discovery), `serena` =
  symbol-precise read/edit/rename/diagnostics, `plain` = `read`/`bash` only.
- `agent` = a subagent or external CLI you will dispatch this task (Rule 4
  patterns only).
- Emit it once per task, as the first line — not on every turn. Re-emit it after
  a compaction: compacted context loses it.
- The scan decides *what to load*. `AGENTS.md` decides *how to work*. Neither
  replaces the other; when they disagree, `AGENTS.md` wins.

Skipping a specialized tool that fits requires an explicit justification in the
reply. "I was going to grep anyway" is not one when `cbm` answers better, and an
absent tool is not evidence that it does not fit.
