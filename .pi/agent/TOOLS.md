# Tools, skills, packages, MCP servers and agents — complete inventory

Companion to `AGENTS.md` (Rule 2). The rulebook carries the curated "load it
when" table; this file is the complete list, so nothing in the loadout is
invisible.

**Maintenance:** when anything here is installed or removed, fix this file in
the same turn. It is hand-maintained — if it disagrees with disk, disk wins.


## 1. Skills

### User skills — `~/.pi/agent/skills/`

| Skill | Source / managed by | Edit survives update? | Description |
|---|---|---|---|
| `api-design-principles` | wshobson/agents | no — CLI-managed, silently reverted | Master REST and GraphQL API design principles to build intuitive, scalable, and maintainable APIs that delight developers. Use when designing new APIs, reviewing API specifications, or establishing… |
| `api-security-testing` | usestrix/strix | no — CLI-managed, silently reverted | Security-test a REST, GraphQL, or gRPC API with Strix — autonomous agents that enumerate endpoints from an OpenAPI/GraphQL schema (or by crawling), then actually exploit the API-specific… |
| `application-security-testing` | usestrix/strix | no — CLI-managed, silently reverted | Application security testing (AppSec) across a whole product with Strix — decide which asset needs which test (source code, running web app, API, CI pipeline), run it, and turn the results into a… |
| `brainstorming` | obra/superpowers | no — CLI-managed, silently reverted | You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation. |
| `caveman` | juliusbrussee/caveman | no — CLI-managed, silently reverted | > Terse caveman voice: answer first, fluff gone, every technical fact kept. Use for /caveman, "caveman mode", "talk like caveman", "be brief", "less tokens". Stays on until "stop caveman" or "normal… |
| `caveman-commit` | juliusbrussee/caveman | no — CLI-managed, silently reverted | > Write a Conventional Commits message compressed to intent only. Use for "write a commit", "commit message", /commit or /caveman-commit. |
| `caveman-review` | juliusbrussee/caveman | no — CLI-managed, silently reverted | > Compressed code review - one line per finding with location, problem and fix. Use for /caveman-review, "review this PR", or "review the diff". |
| `changelog-generator` | composiohq/awesome-claude-skills | no — CLI-managed, silently reverted | Automatically creates user-facing changelogs from git commits by analyzing commit history, categorizing changes, and transforming technical commits into clear, customer-friendly release notes. Turns… |
| `ci-security-scanning-with-strix` | usestrix/strix | no — CLI-managed, silently reverted | Add security scanning to CI/CD with Strix — GitHub Actions, GitLab CI, or any pipeline — so every pull request gets a diff-scoped AI pentest that blocks vulnerable code before it merges, with results… |
| `docx` | anthropics/skills | no — CLI-managed, silently reverted | Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files) or Word templates (.dotx files). Triggers include: any mention of 'Word doc', 'word document',… |
| `error-handling-patterns` | wshobson/agents | no — CLI-managed, silently reverted | Master error handling patterns across languages including exceptions, Result types, error propagation, and graceful degradation to build resilient applications. Use when implementing error handling,… |
| `fallow` | fallow-rs/fallow-skills | no — CLI-managed, silently reverted | Codebase intelligence for TypeScript and JavaScript. Static analysis reports changed-code risk, cleanup opportunities, duplication, circular dependencies, complexity hotspots, architecture… |
| `find-docs` | local (hand-written, unmanaged) | yes | >- Retrieves up-to-date documentation, API references, and code examples for any developer technology. Use this skill whenever the user asks about a specific library, framework, SDK, CLI tool, or… |
| `find-security-vulnerabilities-in-code` | usestrix/strix | no — CLI-managed, silently reverted | Find security vulnerabilities in a codebase or repository with Strix — a white-box AI security review that reads your source, reasons about the actual data flow and authorization model, then exploits… |
| `find-skills` | vercel-labs/skills | no — CLI-managed, silently reverted | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This… |
| `fix-security-vulnerabilities-with-strix` | usestrix/strix | no — CLI-managed, silently reverted | Fix security vulnerabilities found by a Strix pentest (open-source CLI or app.strix.ai cloud) — triage by severity, patch the root cause rather than the symptom, and re-run Strix to prove each fix… |
| `frontend-design` | anthropics/skills | no — CLI-managed, silently reverted | Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated… |
| `impeccable` | local (hand-written, unmanaged) | yes | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers… |
| `improve` | shadcn/improve | no — CLI-managed, silently reverted | Survey any codebase as a senior advisor and produce prioritized, self-contained implementation plans for OTHER models/agents to execute. Strictly read-only on source code — never implements, fixes,… |
| `interface-design` | dammyjay93/interface-design | no — CLI-managed, silently reverted | This skill is for interface design — dashboards, admin panels, apps, tools, and interactive products. NOT for marketing design (landing pages, marketing sites, campaigns). |
| `managed-pentesting-with-strix` | usestrix/strix | no — CLI-managed, silently reverted | Run a managed pentest of a web app, API, repository, or local workspace on the app.strix.ai platform with the `strix cloud` CLI or REST API — no local Docker or LLM key needed. Safely review and… |
| `owasp-top-10-testing` | usestrix/strix | no — CLI-managed, silently reverted | Test an application against the OWASP Top 10 with Strix — autonomous AI agents that attempt real exploits for each category of the current OWASP Top 10:2025 (broken access control including SSRF,… |
| `penetration-testing-with-strix` | usestrix/strix | no — CLI-managed, silently reverted | Pentest a web app, API, codebase, repository, URL, domain, or IP with Strix — autonomous AI penetration testing that exploits and proves vulnerabilities (OWASP Top 10 and beyond — injection, XSS,… |
| `pptx` | anthropics/skills | no — CLI-managed, silently reverted | Use this skill any time a .pptx or .potx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting… |
| `project-start` | local (hand-written, unmanaged) | yes | Run the one-time project-start ritual on a NEW project — draft the charter, decompose the roadmap into horizon-labelled goals with dependencies, seed them atomically into the stepstone worklist, and render the boss-facing HTML roadmap. Not for features on an existing project, and not for per-task planning. |
| `rust-async-patterns` | wshobson/agents | no — CLI-managed, silently reverted | Master Rust async programming with Tokio, async traits, error handling, and concurrent patterns. Use when building async Rust applications, implementing concurrent systems, or debugging async code. |
| `rust-best-practices` | apollographql/skills | no — CLI-managed, silently reverted | > Guide for writing idiomatic Rust code based on Apollo GraphQL's best practices handbook. Use this skill when: (1) writing new Rust code or functions, (2) reviewing or refactoring existing Rust… |
| `security-and-hardening` | addyosmani/agent-skills | no — CLI-managed, silently reverted | Hardens code against vulnerabilities. Use when auditing an input handler for vulnerabilities, when handling user input, authentication, data storage, or external integrations, or when checking a… |
| `security-threat-model` | openai/skills | no — CLI-managed, silently reverted | Repository-grounded threat modeling that enumerates trust boundaries, assets, attacker capabilities, abuse paths, and mitigations, and writes a concise Markdown threat model. Use proactively while… |
| `shadcn` | shadcn/ui | no — CLI-managed, silently reverted | Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces. Provides project context, component docs, and usage examples.… |
| `systematic-debugging` | obra/superpowers | no — CLI-managed, silently reverted | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| `thinking-pre-mortem` | tjboudreaux/cc-thinking-skills | no — CLI-managed, silently reverted | Before committing to a plan or launch, assume it already failed and reason backward through concrete causes — convert failure paths into mitigations, gates, and stop checks. |
| `vercel-react-best-practices` | vercel-labs/agent-skills | no — CLI-managed, silently reverted | React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance… |
| `web-app-penetration-testing` | usestrix/strix | no — CLI-managed, silently reverted | Pentest a web app or website end to end — black-box testing of a live URL, staging environment, or local dev server that finds and exploits real vulnerabilities (auth bypass, broken access control,… |
| `xlsx` | anthropics/skills | no — CLI-managed, silently reverted | Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .xltx, .csv, or .tsv file… |

### Superpowers package — `~/.pi/agent/git/github.com/obra/superpowers/skills/`

| Skill | Source / managed by | Edit survives update? | Description |
|---|---|---|---|
| `brainstorming` | package (reinstalled on update) | no — package-managed | You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business,… |
| `diagnosing-superpowers` | package (reinstalled on update) | no — package-managed | Use when a superpowers session went wrong and your human partner wants to know why — repeated work, ignored plans, stumbles, poor results, a skill that didn't fire, "it took too long", "why is it so… |
| `dispatching-parallel-agents` | package (reinstalled on update) | no — package-managed | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| `executing-plans` | package (reinstalled on update) | no — package-managed | Use when executing an implementation plan in the current session as the implementer yourself — your human partner chose inline execution, or no subagent tool is available |
| `finishing-a-development-branch` | package (reinstalled on update) | no — package-managed | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work |
| `receiving-code-review` | package (reinstalled on update) | no — package-managed | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not… |
| `requesting-code-review` | package (reinstalled on update) | no — package-managed | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| `subagent-driven-development` | package (reinstalled on update) | no — package-managed | Use when executing implementation plans with independent tasks in the current session |
| `systematic-debugging` | package (reinstalled on update) | no — package-managed | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| `test-driven-development` | package (reinstalled on update) | no — package-managed | Use when implementing any feature or bugfix, before writing implementation code |
| `using-git-worktrees` | package (reinstalled on update) | no — package-managed | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback |
| `using-superpowers` | package (reinstalled on update) | no — package-managed | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions |
| `verification-before-completion` | package (reinstalled on update) | no — package-managed | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims;… |
| `writing-plans` | package (reinstalled on update) | no — package-managed | Use when you have a spec or requirements for a multi-step task, before touching code |
| `writing-skills` | package (reinstalled on update) | no — package-managed | Use when creating new skills, editing existing skills, or verifying skills work before deployment |

### Ponytail package — `~/.pi/agent/npm/node_modules/@dietrichgebert/ponytail/skills/`

| Skill | Source / managed by | Edit survives update? | Description |
|---|---|---|---|
| `ponytail` | package (reinstalled on update) | no — package-managed | > Lazy senior dev mode: the smallest change that fully solves the task, and a reply a busy human understands in one read. Use on any coding task (writing, fixing, refactoring, reviewing, choosing… |
| `ponytail-audit` | package (reinstalled on update) | no — package-managed | > Quality audit of a whole repo: bugs, security holes, what breaks under real load, risky code without tests, slow paths, and what to delete, merge or split. Ranked, each finding explained in plain… |
| `ponytail-debt` | package (reinstalled on update) | no — package-managed | > List every `shortcut:` comment (and older `ponytail:` ones) as a debt ledger. One-shot report, changes nothing. Use for "ponytail debt", "what did ponytail defer", "list the shortcuts",… |
| `ponytail-gain` | package (reinstalled on update) | no — package-managed | > Show ponytail's measured savings (code, cost, speed) from the benchmark. One-shot display. Use for /ponytail-gain, "what does ponytail save", "ponytail impact". |
| `ponytail-help` | package (reinstalled on update) | no — package-managed | > Quick reference for ponytail levels, skills and commands. One-shot display. Use for /ponytail-help, "ponytail help", "how do I use ponytail". |
| `ponytail-review` | package (reinstalled on update) | no — package-managed | > Quality review of a change: is the logic right, is it safe, does it hold under real load, is risky code tested, is it fast enough, and is every line needed. Reads the connected code, not only the… |

### pi-subagents package — `~/.pi/agent/npm/node_modules/pi-subagents/skills/`

| Skill | Source / managed by | Edit survives update? | Description |
|---|---|---|---|
| `council-mode` | package (reinstalled on update) | no — package-managed | Run a bounded supervisor-mediated advisor council. Use when the user asks for council mode, asks to convene advisors, debate a decision, cross-examine recommendations, or run /council. |
| `pi-subagents` | package (reinstalled on update) | no — package-managed | \| Technical guidance for operator-requested delegation to builtin or custom subagents: bounded handoffs, parallel review, scripted workflows, async work, forked context, isolation, and coordinated… |

**Total: 58 skills advertised.** None is hidden from model selection:
57 omit `disable-model-invocation` (absent = invocable) and `thinking-pre-mortem`
sets it to `false`. The security-testing skills are gated by rule, not by
frontmatter — see Rule 2 in `AGENTS.md`.


## 2. Skill triggers — when to load which skill

Referenced from `AGENTS.md` → Rule 2 → "Skills — when to load". The skill's own
description says *what it does*; this table states *when it is mandatory*.

### Scope, planning, process

| Skill | Load it when |
|---|---|
| `project-start` | Starting a NEW project, or the user asks to plan a whole project up front — charter + roadmap + atomic seed + HTML render. Not for features on an existing project. |
| `ponytail` | Before writing ANY new code, or when the user asks for the smallest/simplest version. Decides how much to build. |
| `ponytail-review` | Reviewing a diff, PR, or commit for over-engineering. |
| `ponytail-audit` | Whole-repo audit: bugs, bloat, risk, what to delete. |
| `ponytail-debt` | The user asks what was deferred/shortcut. |
| `brainstorming` | Before any feature, component, or behavior change — classify spike/bounded/architectural, and gate implementation on approval. |
| `writing-plans` | Requirements exist and the work is multi-step → write the plan. |
| `executing-plans` | Executing an approved plan inline in this session. |
| `subagent-driven-development` | Executing a plan's independent tasks through subagents. |
| `dispatching-parallel-agents` | 2+ independent tasks with no shared state. |
| `verification-before-completion` | Before claiming done/fixed/passing, and before any commit or PR. |
| `test-driven-development` | Implementing a feature or bugfix. |
| `systematic-debugging` | Any bug, failing test, or unexpected behavior — before proposing fixes. |
| `using-git-worktrees` | Feature work that needs isolation from the current workspace. |
| `finishing-a-development-branch` | Tests pass and the user is deciding how to integrate the work. |
| `using-superpowers` | Session bootstrap — how to find and apply skills. |
| `writing-skills` | Creating, editing, or validating a skill. |
| `thinking-pre-mortem` | Before committing to a plan, migration, or launch. |
| `diagnosing-superpowers` | A session went wrong and the user wants to know why. |

### Review, delegation, orchestration

| Skill | Load it when |
|---|---|
| `requesting-code-review` | Work is complete and about to be merged — ask for review. |
| `receiving-code-review` | Handling review feedback — verify claims, never perform agreement. |
| `caveman-review` | The user wants a compressed, one-line-per-finding review. |
| `caveman-commit` | Writing a commit message (Conventional Commits, intent only). |
| `caveman` | The user asks for terse/caveman output mode. |
| `council-mode` | The user asks to convene advisors, debate, or cross-examine a decision. |
| `pi-subagents` | Delegation mechanics: bounded handoffs, parallel review, scripted workflows, isolation. |

### Docs, evidence, codebase intelligence

| Skill | Load it when |
|---|---|
| `find-docs` | ANY library/framework/SDK/CLI/cloud API or config question. Never guess from training data. |
| `improve` | The user wants an audit, roadmap, or plans for another agent to execute. Read-only by design. |
| `fallow` | TS/JS static analysis: changed-code risk, dead code, duplication, cycles, coverage. |
| `changelog-generator` | Building user-facing release notes from commits. |
| `find-skills` | The user wants a capability that may exist as an installable skill. Note: `npx skills add` installs third-party code → Rule 1 class 2. |

### Frontend, design, language patterns

| Skill | Load it when |
|---|---|
| `frontend-design` | Building new UI or reshaping an existing one — aesthetic direction, not templated defaults. |
| `interface-design` | Dashboards, admin panels, apps, tools (not marketing pages). |
| `impeccable` | Design, redesign, critique, polish, audit, or harden a frontend interface. |
| `vercel-react-best-practices` | Writing, reviewing, or refactoring React/Next.js. |
| `shadcn` | Any shadcn/ui project, `components.json`, registry or preset work. |
| `api-design-principles` | Designing or reviewing REST or GraphQL APIs. |
| `error-handling-patterns` | Implementing error handling or designing for reliability. |
| `rust-best-practices` | Writing, reviewing, or refactoring Rust. |
| `rust-async-patterns` | Async Rust, Tokio, concurrency, async debugging. |
| `docx` / `pptx` / `xlsx` | Creating, reading, or editing Word, PowerPoint, or Excel files. |

### Security — gated, never self-initiated

The nine security-testing skills are model-invocable but gated by rule (see
`AGENTS.md` Rule 2): load one only when the user has named the target and
authorized the test in the current turn. They run attacks, upload source to a
third-party cloud, spend credits (including an agent-payable Stripe top-up), or
rewrite CI.

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

## 3. Packages

Declared in `settings.json` → `packages`. Installed under `git/` and `npm/`.

| Package | What it provides |
|---|---|
| `git:github.com/obra/superpowers` | Process skills: brainstorming, plans, TDD, review, worktrees, subagent-driven development, writing-skills |
| `npm:@dietrichgebert/ponytail` | (describe me) |
| `npm:pi-subagents` | (describe me) |
| `npm:pi-mcp-adapter` | (describe me) |
| `git:github.com/shadcn/improve` | The `improve` skill (read-only codebase surveys → handoff plans) |
| `stepstone` | Project roadmap store and driver: `.worklist/worklist.json` committed in-repo, first-class `dependsOn` edges with `ready`/`next`/`waves` sequencing, a model-facing `worklist` tool, a `/tasks` dashboard, and a loopback web board. **No milestones in 0.12.1** — `group` carries the horizon instead. See the `project-start` skill. |
| `npm:pi-memory` | (describe me) |
| `npm:pi-web-access` | (describe me) |
| `npm:@juicesharp/rpiv-ask-user-question` | (describe me) |
| `npm:@juicesharp/rpiv-todo` | (describe me) |
| `npm:@gotgenes/pi-permission-system` | (describe me) |
| `npm:pi-background-tasks@latest` | (describe me) |
| `npm:@narumitw/pi-plan-mode` | (describe me) |


## 4. MCP servers

Defined in `~/.config/mcp/mcp.json`; reached through the pi-mcp-adapter gateway.

| Server | Transport | Notes |
|---|---|---|
| `serena` | stdio: `serena` | Symbol-precise read/edit/rename/diagnostics; needs a language server |
| `codebase-memory-mcp` | stdio: `/home/miguel/.local/bin/codebase-memory-mcp` | Architecture, call graphs, blast radius, semantic discovery; read-only, best-effort coverage |
| `playwright` | stdio: `bunx` | Real-browser automation; Chromium path pinned in the config |
| `figma` | http: https://mcp.figma.com/mcp | Only when the task is about Figma |
| `stripe` | http: https://mcp.stripe.com | Only when the task is about Stripe |
| `notion` | http: https://mcp.notion.com/mcp | OAuth; only when the task is about Notion |

## 5. Agents

Dispatch by name via the `subagent` tool. `subagent({ action: "list" })` enumerates
everything at runtime; this table is the authoritative roster with the trigger for
each role.

**Read this before choosing a role.** A persona is the *weakest* reason to
delegate — the production evidence (Anthropic's multi-agent postmortem,
Cognition's *Don't Build Multi-Agents*) is that parallel work pays only when the
sub-tasks cannot disagree: reading parallelises, writing does not. Delegation is
authorised by **pattern** (AGENTS.md Rule 4); the agent is chosen by *capability
difference* — a different toolset, a different context window, or a blackbox check
— never by job title alone.

> pi-subagents advertises at most **16 agents / 12,288 bytes** in the parent
> prompt, and only those with `advertise: true`. Currently that is
> `engineering-code-reviewer` and `testing-accessibility-auditor`. The advertised
> list is a hint, not the menu — this table is the menu.

### Builtin — pi-subagents

| Agent | Use it when |
|---|---|
| `scout` | Wide read-only recon across many files (pattern 2). Returns compressed context. |
| `researcher` | External facts, web research, synthesized brief (patterns 3–4). |
| `evidence-auditor` | Independent check that a claim is supported by its sources (pattern 4). |
| `worker` | One bounded implementation slice, contract already pinned (pattern 5). |
| `reviewer` | Independent verification of a diff, plan, or PR (pattern 1). |
| `oracle` | Direction sanity check / drift prevention before an irreversible step (pattern 7). |
| `delegate` | Generic fallback when no specialised role fits. |
| `claude-code`, `codex-exec`, `cursor-agent` | Read-only analysis through that external CLI — only when the user names the CLI. |
| `claude-code-writer`, `codex-exec-writer`, `cursor-agent-writer` | Writing mode of the same; needs an explicit user request (Rule 1 class 2). |

### Security (12)

| Agent | Use it when |
|---|---|
| `security-appsec-engineer` | Auth, input handling, or a newly reachable surface; secure-code review of a change. |
| `security-architect` | Threat-modeling a new service or trust boundary; secure-by-design review before build. |
| `security-secrets-credential-engineer` | Credential lifecycle: vaulting, rotation, least privilege, leak response. |
| `security-senior-secops` | Pre-submission secret/sensitive-data sweep; auditing controls against a standard. |
| `security-ai-generated-code-auditor` | Auditing AI-written code for hardcoded secrets, broken row-level security, prompt-injection sinks. |
| `security-penetration-tester` | **Gated** (Rule 2 security gate: named target + authorization). Authorized pentest/red-team. |
| `security-incident-responder` | A suspected active breach: forensics, containment, crisis coordination, post-mortem. |
| `security-threat-detection-engineer` | SIEM rules, ATT&CK coverage, detection-as-code for a security-relevant path. |
| `security-threat-intelligence-analyst` | Adversary/campaign intelligence feeding a threat model or a prioritization call. |
| `security-cloud-security-architect` | Cloud posture, zero-trust design, IaC security on AWS/GCP/Azure. |
| `security-compliance-auditor` | SOC 2 / ISO 27001 / HIPAA / PCI readiness or evidence collection. |
| `security-blockchain-security-auditor` | Smart-contract / DeFi auditing only. |

### Engineering (28)

| Agent | Use it when |
|---|---|
| `engineering-code-reviewer` | Any diff about to land; correctness/security/performance review of a bounded change. |
| `engineering-software-architect` | A structural decision — boundaries, layering, service split — that feeds a Rule 1 proposal. |
| `engineering-backend-architect` | Server-side design for a new surface: DB architecture, API shape, scaling. |
| `engineering-api-platform-engineer` | Public/partner API contract design, versioning and deprecation policy, SDK generation, gateway policy. |
| `engineering-frontend-developer` | Implementing UI in React/Vue/Angular. |
| `engineering-senior-developer` | A bounded implementation slice (Laravel/Livewire/FluxUI, advanced CSS, Three.js). |
| `engineering-minimal-change-engineer` | A bug-fix diff that must stay minimal; reviewing a change for scope creep. |
| `engineering-codebase-onboarding-engineer` | First pass on an unfamiliar repo; factual code-path tracing, stated as facts only. |
| `engineering-rust-refactoring-specialist` | Repository-scale Rust refactors, renames, panic hardening, Clippy/compiler remediation. |
| `engineering-database-optimizer` | Schema, index, or query tuning on a real Postgres/MySQL schema. |
| `engineering-database-reliability-engineer` | HA, replication, failover, PITR, zero-downtime migrations, connection pooling. |
| `engineering-data-engineer` | ETL/ELT, lakehouse architecture, streaming pipelines. |
| `engineering-devops-automator` | CI/CD pipelines, infrastructure automation, cloud operations. |
| `engineering-platform-engineer` | Internal developer platform: golden paths, self-serve infrastructure. |
| `engineering-developer-tooling-engineer` | CLI and internal-tool DX: command design, error messages, completions, startup time. |
| `engineering-sre` | SLOs, error budgets, observability, chaos testing, toil reduction on a production path. |
| `engineering-incident-response-commander` | Running a live incident, structuring the response, post-mortem facilitation. |
| `engineering-identity-access-engineer` | OAuth/OIDC flows, SAML/OIDC SSO, SCIM, passkeys/WebAuthn, sessions, multi-tenant RBAC/ABAC. |
| `engineering-payments-billing-engineer` | PSP integration, idempotent payment flows, webhooks, subscriptions, SCA/3DS, PCI scope. |
| `engineering-ai-engineer` | ML model development, deployment, or integration into a production feature. |
| `engineering-rag-pipeline-engineer` | RAG chunking, retrieval quality, hybrid search, re-ranking, eval-driven iteration. |
| `engineering-prompt-engineer` | Crafting and systematically testing prompts for production LLM behaviour. |
| `engineering-multi-agent-systems-architect` | Designing or **auditing** an agent pipeline's topology, context management, failure recovery. Use it to critique our delegation patterns, not to build swarms. |
| `engineering-knowledge-graph-engineer` | Structuring entities/relationships for context navigation or token-cost reduction. |
| `engineering-git-workflow-master` | Branching strategy, worktrees, rebase mechanics, CI-friendly branch management. |
| `engineering-technical-writer` | READMEs, API references, tutorials derived from existing code. |
| `engineering-mobile-app-builder` | Native iOS/Android or cross-platform mobile work. |
| `engineering-rapid-prototyper` | A throwaway spike or POC — label the output throwaway (brainstorming skill). |

### Testing and QA (9)

| Agent | Use it when |
|---|---|
| `testing-accessibility-auditor` | Any user-facing UI change; WCAG/assistive-tech audit of a specific interface. |
| `testing-api-tester` | API validation, contract and performance testing, third-party integration checks. |
| `testing-test-automation-engineer` | Playwright/Cypress suite work, flake elimination, CI parallelisation, trace-driven debugging. |
| `testing-performance-benchmarker` | Measuring and improving latency, throughput, or resource use. |
| `testing-evidence-collector` | Reproducible issues with hard evidence (screenshots), and honest untested-scope reporting. |
| `testing-reality-checker` | Pre-release certification. Defaults to NEEDS WORK; demands overwhelming proof. |
| `testing-test-results-analyzer` | Turning raw test results into quality metrics and actionable insight. |
| `testing-tool-evaluator` | Choosing or evaluating a tool, platform, or library for real use. |
| `testing-workflow-optimizer` | Optimizing or automating a business workflow. |

### Design and UX (9)

| Agent | Use it when |
|---|---|
| `design-ux-architect` | CSS systems, layout foundations, and implementation guidance for a page. |
| `design-ui-designer` | Visual design system, component library, pixel-level interface work. |
| `design-ux-researcher` | Usability testing, user-behaviour analysis, data-driven design input. |
| `design-persona-walkthrough` | A cognitive walkthrough of a page from a defined persona's perspective. |
| `design-brand-guardian` | Brand identity or consistency decisions across surfaces. |
| `design-visual-storyteller` | Turning complex information into a visual narrative. |
| `design-inclusive-visuals-specialist` | Reviewing imagery for representation and systemic bias. |
| `design-image-prompt-engineer` | Writing prompts for AI image generation. |
| `design-whimsy-injector` | A deliberate delight/personality pass on a brand experience. Use sparingly. |

### Product (6)

| Agent | Use it when |
|---|---|
| `product-dx-engineer` | Onboarding flows, SDK samples, error messages, time-to-first-success. |
| `product-feedback-synthesizer` | Synthesizing multi-channel user feedback into prioritized insight. |
| `product-manager` | Discovery, strategy, roadmap, stakeholder alignment, go-to-market. |
| `product-sprint-prioritizer` | Sprint planning, feature prioritization, resource allocation. |
| `product-trend-researcher` | Market, competitor, or trend analysis feeding product strategy. |
| `product-behavioral-nudge-engine` | Interaction cadence and personalization for behaviour change. Check the ethics before using it on real users. |

### Project management (7)

| Agent | Use it when |
|---|---|
| `project-manager-senior` | Converting a spec into tasks with realistic scope. Overlaps our openspec/todo flow — use it for task decomposition only. |
| `project-management-project-shepherd` | Cross-functional coordination, timeline and stakeholder management. |
| `project-management-jira-workflow-steward` | Jira-linked git workflow, traceable commits, structured PRs, release-safe branches. |
| `project-management-meeting-notes-specialist` | Transcripts or rough notes → decisions, action items, open questions. |
| `project-management-experiment-tracker` | A/B tests, experiment tracking, hypothesis validation. |
| `project-management-studio-operations` | Process optimization and resource coordination. |
| `project-management-studio-producer` | Multi-project portfolio orchestration. |

### Specialized and other (7)

| Agent | Use it when |
|---|---|
| `specialized-codebase-archaeologist` | Auditing drift in code touched by several AI tools over time (Claude/Cursor/Copilot/Windsurf) for silent mismatches and dead code. |
| `specialized-workflow-architect` | Mapping a complete workflow tree including branches, failure modes and recovery paths. |
| `specialized-mcp-builder` | Designing, building, or testing an MCP server. |
| `specialized-model-qa` | End-to-end audit of an ML or statistical model: replication, calibration, interpretability. |
| `research-synthesist` | Literature review and evidence synthesis with honest weighting. |
| `lsp-index-engineer` | LSP client orchestration and semantic indexing. |
| `agents-orchestrator` | Nested multi-agent pipelines (`allowNestedSubagents`). Use only inside Rule 4's authorised patterns — never to build a swarm. |

### Reachable but without a capability difference

Every agent above is reachable by name, and this list is deliberately exhaustive
rather than curated. What the list does *not* claim is that each row is worth a
dispatch: the majority are job-title personas whose capability does not differ
from the main agent's — no distinct toolset, no distinct context window, no
blackbox check. Per Rule 4 a dispatch still needs an authorised **pattern**. If
the only reason to reach for a row is its job title, do the work yourself and say
so in one line.
