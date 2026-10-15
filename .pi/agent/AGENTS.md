# Global working rules

## Agent instructions — read this before anything else

This file is the authoritative statement of how work is done. It governs every
task, every skill, and every subagent you dispatch. When a skill, template,
package, or workflow document conflicts with these rules, these rules win — fix
the conflicting document rather than silently deviating.

Four rules. Read all four before acting; they are short on purpose.

- **Rule 1 — Ask before you act.** Ten decision classes require the user's yes
  before you touch anything.
- **Rule 2 — Tool selection.** Ponytail decides, CBM maps, Serena executes.
  The curated inventory lives below; the complete list is `TOOLS.md`.
- **Rule 3 — Watchdog.** On multi-step work, arm the 15-minute ping and answer
  it honestly. This is what replaced the old rules 4 and 5.
- **Rule 4 — Delegation.** Wide work goes to subagents; judgment stays local.

Supporting files, all in this directory:

| File | What it is |
|---|---|
| `TOOLS.md` | Complete inventory: every skill, package, MCP server, and agent, with source and when to use it. Read it when the inline table below doesn't cover the tool you need. |
| `WATCHDOG.md` | The standing checklist the Rule 3 ping asks you to answer. |

The user's direct request in the current message always outranks this file.

## Precedence and ordering

1. The user's direct request in the current message.
2. This file.
3. The project's `AGENTS.md` (repo root → subdirectories, nearest wins).
4. Superpowers bootstrap (using-superpowers) and process skills.
5. Other skills, packages, and conventions.

Task-start ordering, every time: (a) load the skill that fits the task;
(b) pick tools from Rule 2's inventory; (c) do the research the task needs;
(d) act; (e) arm the watchdog (Rule 3) if the work is multi-step.

---

## Rule 1 — Ask before you act

Never take a decision in the ten classes below unilaterally. The user wants to
confirm *how* work is done, not only to be unblocked. Asking is never a
violation of this file; assuming silently is.

### The ten classes — ask before acting in any of them

Priority order. When two apply, the lower number goes first in the batched
question.

1. **Architecture & structure** — module and layer boundaries, where state
   lives, service splits, adding a component or a new layer at all, changing how
   existing parts fit together.
2. **Stack & dependencies** — any new dependency, library, framework, runtime,
   ORM, test runner, or build tooling; version pinning or major bumps; removing
   one.
3. **Public contracts** — API endpoints and shapes, database schema, file
   formats, CLI flags, config keys, event payloads. Anything another repo, a
   person, or another agent consumes.
4. **Data & persistence** — migrations, backfills, destructive or lossy
   transforms, retention, seed data.
5. **Security, access & secrets** — auth and authorization model, role and
   permission changes, credential handling, what becomes externally reachable,
   CORS and session policy, anything that widens the attack surface.
6. **Cost & quota** — paid services, credits, API or LLM spend, rate limits,
   anything that can bill the user, including agent-payable paths.
7. **Blast radius & reversibility** — production or shared infrastructure,
   deploys, force operations, deletions, pushing to master, anything the user
   would have to unwind by hand.
8. **Workflow & conventions the user lives with** — landing process
   (direct-to-master vs MR), branching, TDD split, commit granularity, file
   placement, naming that outlives the task.
9. **Product semantics the user feels** — domain weights and formulas, tier and
   model policy, UI semantics, defaults, fallback behavior, user-visible naming.
10. **Scope** — doing less than asked (silently dropping a requested step) or
    more than asked (an unrequested refactor, feature, or file).

### How to ask

- **A researched proposal, never an open question.** 2–4 typed options with
  trade-offs, the evidence behind each, one marked recommended, via
  `ask_user_question`. Asking "which do you prefer?" with no research behind it
  is a violation in the same way asking nothing is.
- **One batched invocation per stage.** Never stack questionnaires
  back-to-back.
- **State the default even when it is obvious.** If you would proceed without
  asking, say the choice in one line: "Took X; say if you want Y." A silent
  default in any of the ten classes is the exact failure this rule exists to
  stop.
- **Ask before the first mutating action in that area.** A proposal written
  after the work already exists is a report, not a question.
- **Self-report the miss.** The moment you notice you decided something in
  classes 1–10 without asking, surface it immediately — do not wait for the user
  to find it. Rule 3's ping exists to catch what you did not notice.
- **Correct with evidence.** When docs, best practice, or real data contradict
  the user's stated approach, push back with the evidence and propose the better
  path. Silently following an inferior instruction is also a violation.

### What you may still decide alone

Mechanical, reversible defaults already fixed by this file, by the project's
conventions, or by prior approval: naming, formatting, file placement inside an
agreed structure, commit granularity inside an agreed workflow, the test
framework the repo already uses. Proceed, and state the choice in one line.

### Subagents

A dispatched agent that hits a class 1–10 decision reports it back to the
orchestrator instead of guessing. The orchestrator batches it to the user.

### Review loops cap at ~3 rounds

Review once, fix real defects, then pause for a human — advisory gates do not
converge to zero on their own.

---

## Rule 2 — Tool selection: Ponytail decides, CBM maps, Serena executes

Three tools, three layers. Pick by the job, not the habit:

- **Ponytail** — DECIDE what/how much to build (YAGNI ladder, shortest diff).
  Runs ON TOP, orthogonal. Required before new code and during review.
- **codebase-memory-mcp (CBM)** — READ/UNDERSTAND structurally: architecture,
  multi-hop callers/callees, cross-service, blast-radius, semantic discovery.
  Read-only graph, best-effort coverage — never mutate through it.
- **Serena** — PRECISE symbol operation + MUTATION: rename, safe-delete,
  replace body, insert, multi-file replace, exact LSP references, diagnostics.
  LSP ground-truth, per-project. Also project memories.

Pipeline: **Ponytail decides → CBM maps → Serena executes.** Ponytail is never
skipped for new code or review; CBM is never used to mutate; Serena is never
used to decide scope.

**The fits-test (before choosing any tool):** does this task need this
capability — scope decision, structural understanding, precise mutation,
browser automation, docs, design? If yes and a tool provides it, use it. "I
was going to grep anyway" is not an exemption when the structural tool
answers the question better.

**Hard nevers:** never re-implement what a few files over already does (look
first); never add a dependency for what a few lines can do; never mutate
through CBM; never decide scope with Serena; never edit code blind to its
callers (trace first); never invent a tool you don't have (state the gap
instead).

**LSP precondition:** Serena needs a working language server. If the language
has no usable LSP, fall to CBM (tree-sitter) or grep — and say so.

**Named minimum set per task type** (checkable, not a numeric minimum):

- **Code change / new feature:** Ponytail scope decision → CBM map (callers /
  blast radius / architecture as applicable) → Serena for edits → Serena
  diagnostics to close the verify loop.
- **Read-only / exploration:** CBM structural tools first
  (search_graph / trace_path / get_architecture); Serena find_symbol /
  get_symbols_overview for precise per-file work; plain reads for line ranges
  and non-code files.
- **Review:** Ponytail `ponytail-review` (scope/YAGNI) + the code-review skill
  or a code-reviewer subagent.
- **Subagent dispatch:** see **Rule 4** for authorisation and the role rotation;
  load the relevant skill first; inject distilled guidance + exact tool names
  into the prompt.

**Project overrides** (a project `AGENTS.md` may add to, never contradict,
these): e.g. coloso-v2 requires no git worktrees for agent-executed work, MR +
squash-merge landing, TDD / ponytail test split. See the project file.

Specialized tools (skills, MCPs, packages) are mandatory when they fit the
task. Finishing a task without using a fitting specialized tool requires an
explicit justification — "none applied" without evidence is not acceptable.

### Task pattern → tool

| Task pattern | Tool | Why |
|---|---|---|
| Should this exist / how much to build | Ponytail | YAGNI ladder is a decision, not a lookup |
| Review current diff for over-engineering | Ponytail `ponytail-review` | Returns a delete-list, not edits |
| Audit repo for speculative abstractions | Ponytail `ponytail-audit` | Whole-repo scope call |
| Track deferred `ponytail:` shortcuts | Ponytail `ponytail-debt` | Ledger of named ceilings |
| "Is this already in the codebase?" | CBM `search_graph` or Serena `find_symbol` | Feed the decision, don't make it |
| Architecture: clusters, layers, hotspots, boundaries | CBM `get_architecture` | Whole-repo rollup; Serena has no equivalent |
| Cycles in the call graph | CBM `get_architecture(cycles)` / `query_graph` | Graph-level; Serena has no multi-hop |
| Single-file outline | Serena `get_symbols_overview` | LSP documentSymbol, precise kinds/nesting |
| Find symbol by exact name (with body, before operating) | Serena `find_symbol` | LSP-accurate, overload-aware, includes body |
| Find symbol by concept / fuzzy / semantic | CBM `search_graph` | BM25 + semantic + name_pattern fusion |
| Direct references, one hop, LSP-accurate | Serena `find_referencing_symbols` | Type-aware; same tool then mutates |
| Transitive callers/callees, depth 3-5 | CBM `trace_path` | BFS multi-hop; Serena has no traversal |
| Data-flow trace with arg expressions | CBM `trace_path` `data_flow` | Serena has no data-flow |
| Cross-service / cross-repo call chain | CBM `trace_path` `cross_service` | CROSS_* edges through Route nodes |
| Blast radius / impact of a git diff | CBM `detect_changes` | Changed symbols → transitive callers + risk |
| Dead-code detection (zero-caller funcs) | CBM `query_graph` / `trace_path` | Graph-level; Serena sees direct refs only |
| Complexity / hot-path props (cyclomatic, loop_depth) | CBM `query_graph` | Serena exposes no such properties |
| Implementations of interface/abstract (LSP-supported lang) | Serena `find_implementations` | LSP-accurate when supported |
| Implementations (no LSP, or cross-repo) | CBM `search_graph` / `query_graph` | IMPLEMENTS edges not LSP-gated |
| Declaration of a symbol, for editing | Serena `find_declaration` | Live buffer, navigates to mutate |
| Declaration / definition, read-only exploration | CBM `get_code_snippet` / `search_graph` | Qualified name + callers, many files/repos |
| Read source of a symbol, right before editing | Serena `find_symbol` `include_body=True` | Authoritative body when LSP is up |
| Read source while navigating the graph | CBM `get_code_snippet` | Works off the index; no LSP needed |
| Arbitrary line ranges, non-code, exact-line edits | plain `read` | Serena/CBM aren't line-range readers |
| Rename symbol, whole-codebase | Serena `rename_symbol` | LSP propagates in one atomic call |
| Delete symbol if unreferenced | Serena `safe_delete_symbol` | Returns ref list if not safe |
| Replace a symbol's body | Serena `replace_symbol_body` | Anchored to identity, not line numbers |
| Insert before/after a specific symbol | Serena `insert_before_symbol` / `insert_after_symbol` | No line-number drift |
| Multi-file find-and-replace with a guard | Serena `replace_in_files` | dry_run → occurrence_ids → apply subset |
| Single-file regex/literal replace (large spans) | Serena `replace_content` | Wildcards for multi-line without full quoting |
| Diagnostics / lint / type errors after an edit | Serena `get_diagnostics_for_file` | Closes the verify loop; CBM has none |
| Coverage: is the graph complete? | CBM `check_index_coverage` / `index_status` | Best-effort signal, never proof |
| Exhaustive / negative claims ("no caller exists") | CBM coverage + Serena/grep in `parse_partial` ranges | Best-effort graph ≠ proof |
| Languages with no usable LSP | CBM (tree-sitter) or grep | Serena is blind without an LSP |
| Polyglot repo, no per-language LSPs configured | CBM | One binary, 158 grammars |
| ADR CRUD tied to the codebase | CBM `manage_adr` | ADR-specific, graph-adjacent |
| General project memory / gotchas | pi-memory `memory_write` / `memory_search` | Freeform, editable, cross-session, semantic search |
| Browser automation / live page checks | MCP `playwright` | Only way to drive a real browser here |
| Current library/framework/SDK/CLI/cloud docs | `find-docs` skill | Canonical docs mechanism; training data is stale |
| Public web facts, version news, comparisons | `web_search` / `fetch_content` (pi-web-access) | Source-linked, retrievable |

**Tie-breakers for overlaps**

- **"find references"** — multi-hop, relational, or discovery: CBM
  `trace_path`. Exact single-symbol LSP refs, especially right before a
  mutation: Serena `find_referencing_symbols` (same tool does the
  rename/delete).
- **"find symbol"** — discovery by concept/semantic or unknown name: CBM
  `search_graph`. Known name, precise retrieval with body, before operating:
  Serena `find_symbol`.
- **"read source"** — navigating the graph: CBM `get_code_snippet`. Right
  before editing: Serena `find_symbol(include_body=True)`. Arbitrary ranges,
  non-code, or exact-line edits: plain `read`.
- **"implementations"** — LSP-supported language: Serena
  `find_implementations`. No LSP, or cross-repo: CBM.
- **Coverage claims** — CBM is best-effort. For exhaustive/negative claims,
  run `check_index_coverage`, then grep / Serena inside `parse_partial`
  ranges before asserting "no X exists".

### Curated inventory — load these when

This table is deliberately terse: it states the **trigger**, which is the part
the model must not have to infer. `TOOLS.md` holds the full descriptions, the
complete trigger table for all 57 skills, and every package, MCP server, and
agent.

#### Skills — when to load

The trigger table for all 57 skills lives in `TOOLS.md` → **Skill triggers**.
Read it before improvising an approach of your own: a skill's description says
what it does, the trigger table says when it is mandatory.

These fire by default, without being asked for:

| Skill | Fires when |
|---|---|
| `ponytail` | Before writing ANY new code, or when the user asks for the smallest/simplest version |
| `find-docs` | ANY library/framework/SDK/CLI/cloud API or config question |
| `brainstorming` | Before any feature, component, or behavior change |
| `systematic-debugging` | Any bug, failing test, or unexpected behavior, before proposing fixes |
| `test-driven-development` | Implementing a feature or bugfix |
| `verification-before-completion` | Before claiming done/fixed/passing, and before any commit or PR |
| `ponytail-review` | Reviewing a diff, PR, or commit for over-engineering |
| `thinking-pre-mortem` | Before committing to a plan, migration, or launch |

#### Security — read the gate below before loading any of these

| Skill | Load it when |
|---|---|
| `security-threat-model` | Proactively while building or reviewing anything that takes untrusted input, authenticates, or integrates externally. |
| `security-and-hardening` | Auditing an input handler, triaging dependency/audit findings, or handling personal data (GDPR/CCPA). |

**Gated security-testing skills — never self-initiate.** These run attacks,
upload source to a third-party cloud, spend credits, or rewrite CI. They are
model-invocable, but the gate is this rule: **load one only when the user has
named the target and authorized the test in the current turn**, and state the
scope back to them before the first command. They also fail Rule 1 class 6
(cost) and class 7 (blast radius) on their own.

| Skill | What it does | Gate |
|---|---|---|
| `penetration-testing-with-strix` | Full pentest of an app/API/repo (OSS CLI, Docker + your LLM key). | Named target + explicit authorization; confirm the target is yours. |
| `web-app-penetration-testing` | Black-box pentest of a live URL or staging site. | Named URL + authorization. |
| `api-security-testing` | API pentest from an OpenAPI/GraphQL schema. | Named API + authorization. |
| `application-security-testing` | Decides which asset needs which test, across a whole product. | User asked for an appsec review. |
| `owasp-top-10-testing` | Maps testing to OWASP Top 10 categories. | User asked for an OWASP-mapped assessment. |
| `find-security-vulnerabilities-in-code` | White-box review of source, exploits findings in a sandbox. | User asked to scan this repo. |
| `managed-pentesting-with-strix` | Runs scans on app.strix.ai: uploads source, spends credits, can trigger an agent-payable Stripe top-up. | User explicitly wants the **managed cloud**, and accepts the upload + spend. |
| `ci-security-scanning-with-strix` | Adds scanning to CI/CD — writes CI config that runs unattended later. | Rule 1 class 8 + class 5: propose before editing any pipeline. |
| `fix-security-vulnerabilities-with-strix` | Patches findings and re-runs to prove the fix. | Only from findings the user accepted; code changes still pass Rule 1. |

#### Packages (installed via `settings.json`)

| Package | Provides | Use it when |
|---|---|---|
| `@dietrichgebert/ponytail` | Scope/YAGNI discipline + review/audit/debt skills | Any coding task |
| `pi-subagents` | The `subagent` tool, builtin agent roster, council mode | Any delegation |
| `pi-mcp-adapter` | MCP gateway (`mcp`, `mcp__<server>`) | Any MCP server |
| `pi-memory` | `memory_*` + `scratchpad` tools | Durable facts, session handoff |
| `pi-web-access` | `web_search`, `fetch_content`, `source_check`, `get_search_content` | Public facts, source verification |
| `pi-background-tasks` | `bg_run` / `bg_status` / `bg_logs` / `bg_kill` — and Rule 3's watchdog ping | Long commands, servers, the ping |
| `@juicesharp/rpiv-ask-user-question` | `ask_user_question` | Every Rule 1 proposal |
| `@juicesharp/rpiv-todo` | `todo` tool | Multi-step task tracking |
| `@gotgenes/pi-permission-system` | Command/path permission policy | Trust boundaries |
| `@narumitw/pi-plan-mode` | Plan mode | When the user asks to plan first |
| `obra/superpowers` (git) | The process skills (brainstorming, plans, TDD, review, worktrees…) | Any non-trivial engineering work |
| `shadcn/improve` (git) | The `improve` skill | Codebase surveys and handoff plans |

#### MCP servers (defined in `~/.config/mcp/mcp.json`)

| Server | Use it when | Notes |
|---|---|---|
| `serena` | Symbol-precise reads, edits, renames, diagnostics | Needs a language server |
| `codebase-memory-mcp` | Architecture, call graphs, blast radius, semantic discovery | Read-only; best-effort coverage |
| `playwright` | Driving a real browser, live page checks | Chromium path pinned in the config |
| `figma` / `stripe` / `notion` | Only when the user's task is about them | HTTP/OAuth servers |

#### Agent roster

Dispatch by name; an unknown name returns the valid choices. Builtins ship with
`pi-subagents`; the rest are markdown files in `~/.pi/agent/agents/`.

| Agent | Use it for |
|---|---|
| `scout` | Bulk recon / wide search that would flood context |
| `researcher` | External facts, web research, synthesized briefs |
| `evidence-auditor` | Independent check that a claim is supported by its sources |
| `worker` | Implementation slices with bounded scope |
| `reviewer` | Verification of finished work |
| `oracle` | Direction sanity check, decision-consistency, drift prevention |
| `delegate` | Generic fallback when no specialised role fits |
| `engineering-code-reviewer` | Deeper correctness/security/performance review |
| `testing-accessibility-auditor` | WCAG / assistive-tech auditing of an interface |
| `agents-orchestrator` | Nested multi-agent pipelines (`allowNestedSubagents`) |
| `claude-code`, `codex-exec`, `cursor-agent` (+ `-writer`) | External CLI agent profiles — only when the user asks for that CLI |

The remaining ~70 files in `~/.pi/agent/agents/` are upstream agency-agents
imports. `ls` the directory before assuming a role exists; do not advertise a
role you cannot grant.

#### Maintaining the inventory

When a skill, package, MCP server, or agent is installed — by you or for you —
append it to `TOOLS.md` in the same turn, and add it here if it is
decision-relevant. The inventory is hand-maintained: if it disagrees with disk,
**disk wins** — say so and fix the file.

---

## Rule 3 — Watchdog: arm the ping, answer it honestly

The old rules 4 and 5 tried to enforce good tool usage with a preamble and an
end-of-task report. They did not work, and they are deleted. This replaces
them: a periodic self-review that happens *while* the work is still changeable.

**Arm it.** At task start, if the work is multi-step or will mutate anything,
arm a background ping before the first substantive action: a `bg_run` sleeping
~15 minutes with a watchdog payload, `isAgent: false`, notifications on. Each
ping is one armed sleep — when it fires, do the review below and re-arm if the
task is still running. Single-question or read-only tasks do not need it.

**Answer it.** On every ping, answer the checklist in `WATCHDOG.md`, in writing,
and keep it short — a clean review is one line. The four questions:

1. **Tools** — did I use the skills, tools, agents, and packages that fit, and
   is every one I skipped justified in one line?
2. **Rule 1** — did I decide anything in any of the ten classes without asking?
3. **Claims vs evidence** — is every "passed", "fixed", "done", or "verified"
   backed by output in the transcript?
4. **Scope** — did I drift past what was asked, or silently drop something that
   was?

**Record it.** Write findings to `.pi/watchdog/REVIEW-<YYYY-MM-DDTHHMM>.md` in
the project (or `~/.pi/agent/watchdog/` when there is no project), with what was
checked, the evidence, severity, and the recommended action.

**False-alarm guard.** Before treating any alert as a finding, verify it against
git. Branch switches produce phantom diffs — a past watchdog alert on
`login.ts` was only an inter-branch difference. Never undo work on a watchdog
alert alone.

**Disarm** when the task ends or the user says stop. Report anything
unresolved.

---

## Rule 4 — Delegate wide work; keep judgment local

Delegation is authorised by **pattern**, not by job title. A persona is the weakest
reason to dispatch: the production evidence (Anthropic's multi-agent postmortem,
Cognition's *Don't Build Multi-Agents*) is that parallel work pays only when the
sub-tasks cannot disagree — **reading parallelises, writing does not**.

### Authorised patterns

1. **Independent verification (blackbox).** A verifier that runs the tests or
   checks and reports needs no implementation context — the highest-value pattern,
   and the most-used one here. State the acceptance criteria and demand
   comprehensive validation; verification agents otherwise take shortcuts.
2. **Wide recon / context compression.** Many files, read-only, returning a
   distilled brief so the raw output never enters this context.
3. **Independent research paths.** Facets that share no context run in parallel.
4. **Evidence audit.** An independent check that a claim you already hold is
   actually supported by its sources.
5. **Contract-first parallel writers.** Only when interfaces, schema, and binding
   decisions are already pinned in the approved plan: each writer in its own
   worktree, one writer per working directory, never two writers on one feature.
6. **Long-running work where only the distillate matters** — builds, suites,
   sweeps, long scans.
7. **Second opinion before an irreversible step** — decision consistency and drift
   prevention.

### Forbidden — each of these is measured to cost more than it saves

- **Problem-type splits of one feature** — one agent implements, another tests, a
  third reviews. Handoffs lose context; in Anthropic's measured experiment those
  role-split agents *"spent more tokens on coordination than on actual work."*
- **Sequential phases of the same work** — planning, implementation and testing of
  one feature share too much context to be worth splitting.
- **Parallel writers without a pinned contract** — conflicting implicit decisions
  produce output that cannot be reconciled.
- **Persona-only delegation** — a different job title is not a different toolset,
  a different context window, or a check.
- **Swarms, or peer agents with their own goals** — the evidence calls these
  "fragile systems"; prescriptive roles and hierarchy prompts did not help.
- **Two writers in one working directory.**

### The budget

If you can finish it in ≤2 tool calls yourself, do that. Otherwise delegate when a
pattern matches. Parallel width is **3–5 children**, not 30 — that is what the
production system reporting a 90% time cut from parallelism used, each child also
running 3+ tool calls in parallel. Parallelism buys thoroughness, not speed: expect
**3–10× the tokens** of doing it inline.

### Choosing the role

`TOOLS.md` §5 lists all 78 user agents and the 13 builtins with the trigger for
each; `subagent({ action: "list" })` enumerates them at runtime. The advertised
catalog in your prompt is capped at 16 agents by pi-subagents and currently carries
only two — **never treat the advertised list as the menu**. If nothing fits, use
`delegate` rather than improvising a persona.

Model tiers are **enforced** in `subagents.modelScope` — do not fight them:

  tier 1  (glm-5.3)             FORBIDDEN for subagents (quota)
  tier 2  (glm-5.3-flash)       anything that judges: review, verification, oracle
  tier 3  (deepseek-v4.1-flash) recon, mechanical, parallel work

Children resolve to the tier default, **not** to your current model. The tier
names are the contract; the concrete model table lives in `settings.json`, so a
model change moves the table and keeps the names.

Every dispatch passes: the plan file path (if any), exact paths in scope, the
tier, and the grants the child needs. Skills arrive via `inheritSkills`/`skills`,
never in `tools:` (which takes tools and `mcp:` entries only).

MCP tools reach children through the adapter's GATEWAY tools, not per-server
selectors: grant `mcp` and `mcpScript` in `tools`, and launch the role async
(foreground children never load ambient extensions). Per-server `mcp:serena` /
`mcp:codebase-memory-mcp` selectors FAIL for children in this setup, and a failed
selector blocks the whole launch — do not add them. Verified 2026-09-28: a scout
child called `mcp` and its search resolved tools from both serena and
codebase-memory-mcp.

State each dispatch in one line when you hand work back.

---

## Appendix A — Pi tool mapping

Pi's built-in tools are lowercase: `read`, `write`, `edit`, `bash`, plus
optional `grep`/`find`/`ls`. This file's rules are tool-agnostic — map names
as follows when a skill or table mentions Claude Code tool names:

- `Read`/`Edit`/`Write` → `read`/`edit`/`write`.
- `Skill` tool → Pi's native skill system (`/skill:name`, or load the
  skill's `SKILL.md` with `read` when the skill applies).
- `Task`/subagent dispatch → the `subagent` tool from `pi-subagents`
  (agents defined as markdown in `~/.pi/agent/agents/` and built into
  `pi-subagents`); if no subagent tool is available, do the work in this
  session and say so — never invent `Task` calls.
- Todo/task tracking → the `rpiv-todo` tools; plan files or a
  repo-local `TODO.md` as fallback.
- Background shell jobs (servers, builds, watchers, the Rule 3 ping) →
  `pi-background-tasks` (`bg_run`/`bg_status`/`bg_kill`); agent delegation →
  `pi-subagents` (`subagent` tool).
- Structured proposals / decisions → the `ask-user-question` tool (typed
  options, recommended option first and tagged), not prose questions.
- MCP tools → the pi-mcp-adapter proxy (server tools appear as the adapter's
  tool surface).

## Appendix B — Evidence fetching

For library/framework/SDK/CLI/cloud documentation — including well-known
libraries; training data may be stale — use the `find-docs` skill. It is the
single canonical docs mechanism (Context7 CLI via bunx); follow its workflow
and hard rules: max 3 commands per question, and never silently fall back to
training data.

Do not use it for: refactoring, scripts from scratch, debugging business
logic, code review, or general programming concepts.

## Appendix C — Locally edited managed skills

Some skills in `~/.pi/agent/skills/` are installed by the skills.sh CLI (global
lock: `~/.local/state/skills/.skill-lock.json`) and deliberately **edited after
install**. `bunx skills@latest update -g` re-copies any skill whose upstream
hash differs from the lock entry (`cli.mjs:7396`, `latestHash !==
entry.skillFolderHash`) — the local file is never hashed, so these edits are
**silently reverted** on the next upstream publish with no warning. Re-apply
after every `skills update`:

- `security-threat-model/SKILL.md` — description relaxed to proactive
  (upstream ships "Trigger only when the user explicitly asks …").
- `thinking-pre-mortem/SKILL.md` — `disable-model-invocation: false` (upstream
  ships `true`, which hides it from the system prompt entirely; pi honors the
  field at `dist/core/skills.js:262` and filters at `:279`).

Prefer adding new always-on skills to `~/.pi/agent/skills/` directly (not via
the CLI) so no updater owns them. `security-and-hardening` is CLI-managed and
unedited — leave it managed.

## Appendix D — Memory

Memory is handled by the `pi-memory` package — extension tools
(`memory_write`, `memory_read`, `memory_search`, `memory_forget`,
`memory_restore`, `scratchpad`, `memory_status`), not a skill. Storage is
plain markdown under `~/.pi/agent/memory/`:

- `MEMORY.md` — curated cross-project long-term memory; tagged lines
  (`#tag [[link]] fact`), project-specific lines carry a `#<project>` tag.
  Injected into context each session (capped), so keep it lean.
- `daily/YYYY-MM-DD.md` — append-only work log; session handoffs are written
  here automatically on compaction.
- `SCRATCHPAD.md` — open items; injected until done.
- Per-project stores (e.g. `coloso-v2/`) — durable deep knowledge, one fact
  per file (frontmatter: `name`, `description`, `type`) + a `MEMORY.md`
  index. Keep this format for large project stores; qmd indexes everything.

- At task start on a known project: read the project store's `MEMORY.md`
  index, then recall topic files or use `memory_search` (keyword fast,
  semantic/deep via qmd when wording differs).
- Record durable facts with `memory_write` (long-term for facts/decisions,
  daily for progress). Delete only via `memory_forget` (recovery-safe).
- Don't record what the repo already shows (code structure, git history) or
  what only matters to the current conversation.
- Link related memories with `[[their-name-slug]]`; use `#tags` for
  searchability.
- Durable repo conventions belong in the repo's `AGENTS.md` (versioned,
  auto-loaded, shared) — memory is for what the repo can't show.
