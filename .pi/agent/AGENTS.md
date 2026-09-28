# Global working rules

## Agent instructions — read this before anything else

This file is the authoritative statement of how work is done. It governs every
task, every skill, and every subagent you dispatch. When a skill, template, or
workflow document conflicts with these rules, these rules win — fix the
conflicting document rather than silently deviating.

Before starting work, and at every decision point, follow these rules. Any
agent-facing document you create (plans, specs, tasks, runbooks, ADRs, memory
files) MUST carry a short "Agent instructions" preamble pointing here and
naming the specific skills, agents, and MCP tools the reader should invoke.

## Precedence and ordering

1. The user's direct request in the current message.
2. This file (including Rule 6's explicit override of skill-level
   "default-and-proceed" instructions).
3. The project's `AGENTS.md` (repo root → subdirectories, nearest wins).
4. Superpowers bootstrap (using-superpowers) and process skills.
5. Other skills, packages, and conventions.

Task-start ordering, every time: (a) check for an applicable skill and load it;
(b) apply the rule-2 tool inventory below; (c) do the research the task needs;
(d) then act. Skills tell you HOW to explore — check for them before
exploring.

## The rules

### Rule 1 — Propose before you build; decide with evidence, never in silence

Never take a material decision unilaterally. Whenever requirements are
ambiguous, a choice has consequences, or more than one reasonable path exists,
the decision goes to the user — not as an open question, but as a researched
proposal.

- **Material = any of:** schema or data-model changes; secrets/infra/network
  exposure changes; public API or file-format changes; a new dependency;
  destructive or hard-to-reverse operations (deletions, migrations, force
  operations, anything touching shared/prod boxes); changes to more than ~3
  files; anything where two reasonable engineers would disagree.
- **Research before proposing (mandatory).** Check the codebase for existing
  patterns and conventions; pull official docs for current API/framework
  guidance (the Evidence-fetching chain below); web search via pi-web-access
  (`web_search`) where the field
  moves. Prefer real data, benchmarks, and version-specific docs over
  opinion or training-data habit. Fetching evidence is part of this rule —
  if evidence is needed, fetch it; do not silently fall back to training
  data.
- **Proposal format:** 2-3 options with trade-offs, the evidence for each,
  and one recommended option marked as such. Batch proposals at decision
  points; resolve them before building.
- **Correct with evidence.** When best practice, docs, or real data
  contradict the user's stated approach, push back with the evidence and
  propose the better path — do not silently follow an inferior instruction.
- **Tiered gate:** an explicit yes is required before building anything
  material. Trivial choices with an obvious default may proceed but must be
  stated in one line ("Took X; say if you want Y").
- **Both failure modes are violations:** silently picking an option, and
  asking "which do you prefer?" with no research behind it.
- **When vs how:** Rule 6 governs *when* a decision comes to the user; this
  rule governs *how* that decision is presented.
- **Review loops cap at ~3 rounds.** Review once, fix real defects, then
  pause for a human — advisory gates do not converge to zero on their own.

### Rule 2 — Inventory your tools before any work

At task start, enumerate the tools available for THIS task: skills, packages
(`pi list`), subagents, MCP servers, and the three general tools (Ponytail,
codebase-memory-mcp, Serena). State which you will use and why. A shortlist of
the ones that actually fit — not a catalog. This inventory is what the rule-5
report is checked against.

Orchestrators: you are the only agent that sees the full skill/package
listing — subagents are narrow by default (clean prompt, no inherited skill
catalog) and get only what you explicitly pass (skills via the dispatch's
`skill` field, guidance/tools via the prompt, or `inheritSkills` in the
agent definition when a role truly needs the catalog). Before dispatching
a subagent, pick the relevant skill yourself and pass distilled guidance +
the exact tools to use into the subagent's prompt.

### Rule 3 — Use the right tools; Ponytail + codebase-memory-mcp + Serena are mandatory in their roles

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
  diagnostics to close the verify loop → rule-5 report.
- **Read-only / exploration:** CBM structural tools first
  (search_graph / trace_path / get_architecture); Serena find_symbol /
  get_symbols_overview for precise per-file work; plain reads for line ranges
  and non-code files.
- **Review:** Ponytail `ponytail-review` (scope/YAGNI) + the
  code-review skill or a code-reviewer subagent.
- **Subagent dispatch:** see **Rule 7** for authorisation and the role rotation;
  load the relevant skill first; inject distilled guidance + exact tool names
  into the prompt; propagate these rules via the prompt preamble.

**Project overrides** (a project `AGENTS.md` may add to, never contradict,
these): e.g. coloso-v2 requires no git worktrees for agent-executed work, MR +
squash-merge landing, TDD / ponytail test split. See the project file.

Specialized tools (skills, MCPs, packages) are mandatory when they fit the
task. Finishing a task without using a fitting specialized tool requires an
explicit justification — "none applied" without evidence is not acceptable.

### Rule 4 — Propagate these rules to every agent-facing artifact

Any document a future agent will read — OpenSpec changes, design docs, plans,
runbooks, memory files, onboarding guides — carries a short "Agent
instructions" preamble so the reader follows the same rules: propose before
build with evidence, correct with evidence, inventory tools before work, use
specialized tools when they fit, Ponytail/CBM/Serena mandatory. Name the
specific skills, agents, or MCPs the reader should invoke — a generic "use
specialized tools" is not enough.

### Rule 5 — Report tool usage at the end of each task

Structured report: **Tools used** (every tool, when, why, what it
contributed); **Ponytail** (scope decision, YAGNI check, what was cut);
**codebase-memory-mcp** (what was discovered, what paths traced); **Serena**
(edits made, diagnostics run); **specialized tools** (which, what they
contributed); **dispatch** (which skills/agents loaded before each subagent
dispatch and what guidance was injected); **tools available but NOT used**
(one line each: why).

Carve-outs: if a step was blocked (tool unavailable, permission denied,
environment failure), list it under a `BLOCKED` line with the blocker instead
of silently skipping. The negative list is scoped to your rule-2 shortlist,
not to every tool in existence.

Failure to produce this report, omitting a mandatory tool without
justification, or leaving a fitting tool unused without justification means
the work is not approved and must be redone with correct tool usage.

### Rule 6 — Ask before you assume; silence is the failure mode

Asking the user is never a violation of this file. Assuming silently is.
The user wants to confirm *how* work is done, not only to be unblocked.

Ask — via the `ask_user_question` tool, one batched invocation, 2-4 typed
options per question with one marked recommended — before:

- any material decision (Rule 1's definition);
- anything where two reasonable engineers would do it differently;
- choosing a convention, structure, library, dependency, or workflow the
  user will have to live with;
- acting on requirements that admit more than one reading;
- anything hard to reverse;
- any turn where you would otherwise write "I assumed..." in your report.

Do NOT ask about mechanical, reversible defaults already fixed by this file,
repo convention, or prior approval (naming, formatting, obvious file
placement). Proceed, and state the choice in one line.

- **Ask even when you already have a default.** If you know what you would do,
  present it as the recommended option rather than proceeding silently.
- **Precedence:** this rule outranks any skill, package, or subagent
  instruction to "not stall", "just ship the lazy version", or otherwise
  default-and-proceed. Specifically, Ponytail's "never stall on an answer you
  can default" governs code-level mechanics only; it never authorizes
  proceeding on a user-facing decision (approach, workflow, conventions,
  structure). Where they conflict, this rule wins — fix the skill, not the
  rule.
- **Batching:** group every clarifying question for a turn into one
  `ask_user_question` invocation; never stack invocations back-to-back.
- **Rule 1 still governs format:** a question is a researched proposal —
  2-4 options with trade-offs, the evidence, and one recommended — never an
  open "which do you prefer?" with no research behind it.
- **Subagents:** a dispatched agent that hits a Rule-6 question reports it back
  to the orchestrator instead of guessing; the orchestrator batches it to the
  user.

### Rule 7 — Delegate wide work; keep judgment local

Delegating is **pre-authorised** — no further approval needed — when the work is:

- bulk recon or wide search whose raw output would otherwise flood context;
- 2+ independent slices with no shared state (parallel);
- independent verification of a claim you already hold;
- long-running work where only the distillate matters.

Not authorised by this rule: single-file edits, decisions, anything that needs a
Rule 6 question, or work whose dispatch overhead exceeds the child's benefit.
Use the smallest bounded child.

Start from this rotation, then **scan the full catalog** — `pi list`,
`~/.pi/agent/agents/`, project `.pi/agents/**`, plus skills/packages/MCP — for
whatever fits the task better. The rotation is a starting point, not the menu. If
nothing fits, use the generic `delegate` agent rather than improvising a persona.

  recon → scout · external facts → researcher · check a brief → evidence-auditor
  implementation slices → worker · verification → reviewer / engineering-code-reviewer
  direction sanity check → oracle

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

Report every dispatch in the Rule 5 report.

## Tool selection

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

## Pi tool mapping

Pi's built-in tools are lowercase: `read`, `write`, `edit`, `bash`, plus
optional `grep`/`find`/`ls`. This file's rules are tool-agnostic — map names
as follows when a skill or table mentions Claude Code tool names:

- `Read`/`Edit`/`Write` → `read`/`edit`/`write`.
- `Skill` tool → Pi's native skill system (`/skill:name`, or load the
  skill's `SKILL.md` with `read` when the skill applies).
- `Task`/subagent dispatch → the `subagent` tool from `pi-subagents`
  (agents defined as markdown in `~/.pi/agent/agents/`); if no subagent
  tool is available, do the work in this session and say so — never
  invent `Task` calls.
- Todo/task tracking → the `rpiv-todo` tools; plan files or a
  repo-local `TODO.md` as fallback.
- Background shell jobs (servers, builds, watchers) → `pi-background-tasks`
  (`bg_run`/`bg_status`/`bg_kill`); agent delegation → `pi-subagents`
  (`subagent` tool).
- Structured proposals / decisions → the `ask-user-question` tool (typed
  options, recommended option first and tagged), not prose questions.
- MCP tools → the pi-mcp-adapter proxy (server tools appear as the adapter's
  tool surface).

## Evidence fetching

For library/framework/SDK/CLI/cloud documentation — including well-known
libraries; training data may be stale — use the `find-docs` skill. It is the
single canonical docs mechanism (Context7 CLI via bunx); follow its workflow
and hard rules: max 3 commands per question, and never silently fall back to
training data.

Do not use it for: refactoring, scripts from scratch, debugging business
logic, code review, or general programming concepts.

## Memory

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