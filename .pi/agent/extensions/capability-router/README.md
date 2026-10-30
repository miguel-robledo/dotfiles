# capability-router

Pi installs far more capability than it advertises: **78 subagents (2 advertised), 35 skills, 6 MCP
servers, 14 packages**. Prose rules in `AGENTS.md`/`TOOLS.md` did not change behaviour. This extension
puts the inventory in front of the model *and* lets a decision model pick the fitting one per task.

It is **advisory**. It never invokes a capability, never edits a file, never changes the model.

## How it decides

No keyword table. The installed capability's own `description:` (written for every agent and skill)
is the only vocabulary the router knows, plus one-line purposes for MCP servers in `map.json`.

```
your message
  ├─→ classify the RAW prompt over all 119 capabilities + "none"     (always; the floor)
  └─→ planner (chat, sees the project brief): 1–3 concrete workstreams, or "none"
        └─→ classify each workstream                                   (adds project specifics)
  → merge both, dedupe, order: raw picks first
  → emit one line per fitting capability: silent if "none" ≥ 0.25 or the best option < 0.12;
    otherwise every option above max(0.05, 0.15 × best); 4 per question, 6 total
  → agents must additionally clear p ≥ 0.45 (measured: implementation-shaped steps matched
    "expert X engineer" personas at 0.20–0.29 and would have over-delegated four times)
```

The raw classification is never dropped, because two measured failure modes showed why: rewritten
workstreams can classify *weaker* than the original text, and the planner answered `none` for
"explain the architecture here: who calls this module" — a question plainly about the codebase.

Project context reaches the classifier **only through the planner's rewritten workstreams**.
Measured why: appending the brief to the task text directly made `what is 2+2` in a Rust repo
produce three Rust hints. Asking the planner to answer `none` for non-project tasks fixes that.

Measured latency (this machine, per user message): planner ~1.1 s (`think: false`; 2.4 s with
thinking), classifier ~0.9 s per workstream, run in parallel. Pi's own startup in this environment is
~18–20 s with all packages loaded (MCP servers spawn at session start), so the router's share of
time-to-first-token is ~2 s.

Measured on this machine (`clef:cloud`, 27B, Ollama 0.40.13): **119 options, ~4.5k input tokens,
0.7–1.4 s, ≈$0.001 per message**. Results cached per prompt for the session.

**How many hints** is decided by the distribution, not by a count: a focused task has one dominant
option, a multi-part task spreads across several.

| prompt | hints | picks |
|---|---|---|
| `perform a code quality and cybersecurity audit` | 4 | ai-generated-code-auditor, find-security-vulnerabilities, appsec-engineer, application-security-testing |
| `review this migration for security issues and performance` | 4 | code-reviewer, database-optimizer, find-security-vulnerabilities, backend-architect |
| `fix the a11y bug and add tests` | 1 | accessibility-auditor |
| `check accessibility: keyboard, contrast, screen reader` | 1 | accessibility-auditor |
| `what is 2+2` / `read /tmp/x.txt` | 0 | silent |

Why all 119 at once: a lexical pre-filter was tried first and rejected on evidence — it could not
surface `systematic-debugging` for *"the build fails with a stack trace"* (0 keyword overlap), while
Clef picked it at 0.765 with the whole inventory in view. The same prompt through the earlier
keyword implementation matched `incident` and named the wrong agent.

Gate behaviour, measured through real Pi (all 119 options offered):

Single-focus prompts (measured, top probability):

| prompt | pick | p |
|---|---|---|
| check accessibility: keyboard, contrast, screen reader | `testing-accessibility-auditor` | 0.927 |
| review this PR for correctness | `engineering-code-reviewer` | 0.904 |
| explain the architecture / blast radius | `codebase-memory-mcp` | 0.809 |
| build fails with a stack trace | `systematic-debugging` | 0.771 |
| readme + changelog | `changelog-generator` | 0.721 |
| dashboard form with responsive layout | `interface-design` | 0.474 |
| rename helper + dead code | `serena` | 0.434 |
| make it better | `improve` | 0.415 |
| database migration + backfill | `engineering-database-optimizer` | 0.400 |
| security review of an auth diff | `engineering-identity-access-engineer` | 0.245 |

Known limitation: the thresholds surface what the model judges plausible, not what a human would
split. For `fix the a11y bug and add tests` it scores tests at 0.044 and only the accessibility
auditor is hinted. If a hint misses a half you care about, the fix is in the model's ranking, not in
a keyword list — raise `RELATIVE_FLOOR` down/up or rephrase.

## Why Clef is registered in code, not `models.json`

`models.json` model entries apply to **chat models only** — a custom provider cannot declare a
classifier there (verified: the block is accepted and silently ignored). Extensions can, so
`clef.ts` calls `pi.registerProvider(...)` with a `classifiers["typesafe-system-one"]` transport
pointing at Ollama's `/v1/systemone` (body `{model, state, questions}`, identical to what Pi's client
sends). Two dialect differences are handled there: Ollama wants `type: "noul"` where Pi sends
`bool`, and it returns `{type:"noul", noul:<p>}` where Pi expects `{type:"bool", probability}`.

Requires: Ollama ≥ 0.40.6 with `clef:cloud` pulled. `clef:cloud` and `clef:27b-cloud` are the same
blob; there is no cloud tag for the 9B `clef-flash`.

## Files

| File | Role |
|---|---|
| `index.ts` | Hooks, `/capabilities`, `tool_search` activation, usage recording, prompt sections. |
| `indexer.ts` | Reads `{agents,skills,prompts}`, settings packages, MCP servers; builds capabilities; renders the static section. |
| `judge.ts` | The choice question, the probability gate, the classifier call. Pure gate logic for tests. |
| `planner.ts` | Splits the task into 1–3 workstreams with one chat call; answers `none` off-project. |
| `context.ts` | Project brief: manifest/language/framework, top-level tree, changed files. |
| `clef.ts` | Registers Clef as a Pi classifier over Ollama's System One API. |
| `router.ts` | Suggestion/hint formatting and the usage matcher. |
| `map.json` | Tuning surface: judge settings, call syntax templates, MCP/package purposes. |
| `plan-review.ts` | Compares a plan's capability rows with what the router would pick; asks the model to rewrite the table. |
| `report.ts` | Session mining → coverage of the installed inventory. |
| `inventory.ts` | The `capabilities` tool: 145 entries (78 agents, 61 skills incl. package skills, 6 MCP) with `kind`/`detail`/`query`. |
| `conformance.ts` | In-run check: declared plan rows vs families actually used, with a hard noise budget. |
| `router.test.ts` | 32 pure tests: question shape, gate (real distributions), hint budget, matcher, index, conformance budget. |

## Tuning

- `map.json → judge`: `enabled`, `model`, `baseUrl`, `timeoutMs`. Disable with `"enabled": false`.
- `map.json → planner`: `enabled`, `timeoutMs`, `maxWorkstreams`. Disable for the old single-pass
  behaviour (one classify call on the raw prompt, no project context).
- `map.json → purposes`: one-liners for MCP servers and packages. These are the only hand-written
  words in the system, and they describe a server, not the user's vocabulary.
- `map.json → syntax`: the call shape copied into each hint. Keep them valid.
- Thresholds live in `judge.ts` (`MIN_PROBABILITY`, `MIN_RATIO`) with the sample distributions in the
  tests — change a threshold and the tests tell you what it would start hinting on.
- Run `bun test router.test.ts` after any edit.

## Measurement: coverage, not call counts

`/capabilities report --days 14` counts, for each installed capability, whether it was ever used in
that window: agents via `subagent`, skills via reads of their `SKILL.md`, MCP servers via
`mcp__<server>` or `mcp({server})`. It writes `coverage-<days>d.json` beside the extension and prints
the percentages plus the never-used lists.

Success is not "more calls". It is: a capability that fits gets named when the task calls for it, and
the never-used list shrinks because the inventory is reachable — measured against coverage, with
failed-tool-result rate as the health check.

`usage.jsonl` records one row per run: `{ts, session, picks: [...]}`, `picks: []` when silent.

## Plan-time review

When `plan_mode_complete` succeeds, the router classifies the plan's own step list (its `## Capabilities`
cells, or headings when there is no table) and sends findings back with `steer`:

- a step whose declared capability loses to a much better fit (p ≥ 0.40, different family);
- a step with no row at all, when the router is confident;
- never for primitive rows (`read`, `bash`, …) — suggesting an agent instead of `bash` is the nag that
  makes audits get ignored;
- never for unknown `skill:` or `subagent:` names — repo-local skills and builtin agents are not in the
  index, so an unknown name is not evidence of a mistake.

The message asks the model to **re-submit the plan** with a corrected table; the router never edits the
plan, because the model writes better prose and learns the mapping by writing it.

The plan's `## Capabilities` table now holds **custom capabilities only** (`mcp:`, `subagent:`,
`skill:`); natives are implicit, so a row records a decision instead of restating what the agent does
by default. Reviews therefore report disagreements on declared rows and unknown MCP servers — never
"you omitted a row".

Calibration on two real plans from the session history:

| plan | findings |
|---|---|
| 27 rows, public registration flow | 1 — `skill:supabase-postgres-best-practices` → `agent:engineering-database-optimizer` (p=0.60) |
| 17 rows, pagination work | 0 |

## Trigger coverage (at plan time)

Row-level review can only judge rows that exist, so omissions were invisible. Every `TOOLS.md` §2 trigger
is therefore asked as one closed yes/no question over the plan text — one classifier call, ~0.8 s,
~5.5 k input tokens — and each "yes" obliges the plan to declare the capability that trigger requires.

Measured on a real 4-row plan: 6 triggers fired, 4 obligations were missing
(`error-handling-patterns`, `find-docs`, `security-and-hardening`, `executing-plans`) — exactly the gaps
manual review found — plus `serena/rename_symbol`, which the plan had rejected on the record, so
`parseRejections` now honours the plan's own `Rejected:` line and that finding disappears.

## In-run conformance

When a plan is submitted (`plan_mode_complete`), its `## Capabilities` rows are recorded — only if the
submission succeeds, so a rejected plan leaves nothing behind. At each `turn_end`:

- a declared non-primitive row that is still unused, while this turn did work with primitives only,
  produces one corrective line: `Capability check: step "rename helper" declared mcp:serena/rename_symbol, still unused. This turn used: read, bash. Use the declared capability or say in one line why the primitive is enough.`
- delivery uses `deliverAs: "steer"`, because `nextTurn` is only consumed when a *new run* starts
  (measured: the correction vanished). Steer injects before the next model call in the running loop.
- budget: no session cap. One message per turn lists **every** capability still unused (max 8 lines,
  then "… and N more"), and each row is mentioned exactly once. A configuration-blocked row is reported
  to the user instead and never counted as a correction.
- meta tools are not work: a turn that only submitted a plan, asked a question or read this inventory
  never triggers a correction (measured defect: "this turn used: plan_mode_complete").
- a declared `mcp:` capability whose precondition fails locally (no language server for serena, missing
  browser for playwright, project not indexed for codebase-memory-mcp) is reported to the **user** with a
  fix, and is not sent to the model at all.
- declared skills that are already the session's active mode (`ponytail`) are skipped, not reported.
- plan-review runs **once per distinct plan text** (hash), so re-submitting an unchanged plan is silent.
- on `session_start` the declared rows are rebuilt from the transcript, so a `/reload` (needed after
  editing the router) does not lose the plan being checked.

Limits: a run that finishes in a single turn gets no correction (there is no next model call), and the
check is family-level (`mcp:serena`, not the individual tool). It never blocks anything.

## Rollback

```bash
rm -rf ~/.pi/agent/extensions/capability-router
```

Then `/reload`. Nothing else changes: no `settings.json`, `AGENTS.md`, `TOOLS.md` or provider config
was modified, and no package was installed. The only host dependency is Ollama ≥ 0.40.6 with
`clef:cloud`, which the router registers at load — removing the folder removes the classifier
registration too.
