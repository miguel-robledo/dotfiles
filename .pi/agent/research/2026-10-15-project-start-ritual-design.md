# Project-start ritual — design (option A)

Status: **decided and partially built, 2026-10-15.** The four decisions are recorded in §13;
§12 records what the dry run against 0.12.1 changed (§3–§5 predate that correction).
Built so far: `~/.pi/agent/skills/project-start/`. Nothing in any real project has been touched.
Date: 2026-10-15. Companion research: `2026-10-15-production-workflow-gap-analysis.md`,
`r1-roadmap-tooling-survey.md`, `r2-roadmap-methodology.md`.

## 1. What this is, and what it is not

**Is:** a one-time ritual at the start of a new project that produces a **charter**
(what and why, boundaries, non-goals) and a **roadmap** (outcomes, ordered work,
one committed horizon). Day-to-day work then starts from the roadmap's `next`,
not from what feels urgent that morning.

**Is not:**
- Not per-task planning. Plan mode and OpenSpec keep their current role — they are
  *triggered by* a roadmap item instead of by daily impulse.
- Not an execution loop. There is no auto-continue and no goal runner. `pi-goal-x`
  was rejected for exactly this (the agent fixated on goal state instead of the work).
- Not applicable to existing projects. New projects only.

## 2. What the evidence constrains

| Constraint | Source |
|---|---|
| Freeze the **shape** (problem, boundary, appetite, no-gos), not the schedule | Shape Up: *"only bet one cycle at a time … we keep it in our heads"*; Shape Up refuses a project roadmap entirely |
| **Changing** plans is what moves outcomes, not plan fidelity | Dvir & Lechler 2004, *"Plans are nothing, changing plans is everything"* |
| Planning returns **saturate**: R²≈0.33/0.34 at 20–33% planning effort | Serrador & Turner; Dvir, Raz & Shenhar |
| Requirements volatility predicts defects, delay, overruns | Wiley JSME 2020 |
| Committed goals have a documented dark side: cheating, narrowed focus | *Goals Gone Wild*, HBS |
| Ship the caveat; keep the artifact alive on a cadence | Kubernetes pruning, RSI caveats page, CNCF ~6-week early review |
| One source of truth — a second copy drifts | This repo's own `openspec/config.yaml` disagreed with `AGENTS.md` for a day |

**Net effect:** commit *one* horizon, shape each item enough to be bettable, and make
re-shaping cheap and explicit. Do not write the whole project's specification up front.

## 3. The three artifacts

| Artifact | Lives where | Committed? |
|---|---|---|
| **A. Charter** | `docs/PROJECT.md` in the repo | Yes |
| **B. Roadmap** | `.worklist/worklist.json` (stepstone's store, repo root) | Yes |
| **C. Per-item shape** | the task's `description`, or a doc referenced via `--link` | With the repo |

### A. Charter — `docs/PROJECT.md`

Required because **stepstone cannot store any of it**: a project is only a title plus
optional repository URLs. Contents, in order:

1. **Problem** — the thing that is broken or missing, in one paragraph.
2. **Users / segment** — who specifically (Amazon's PR/FAQ insists the exact segment is named).
3. **Success criteria + feedback signal** — what "working" means and what will *tell* us
   (goal-setting theory needs specific goals **and** feedback; *Goals Gone Wild* is the counterweight).
4. **Boundaries and invariants** — the durable architectural rules that outlive any task
   (the equivalent of coloso-v2's "Coloso split").
5. **Non-goals** — explicit, so scope creep has something to be measured against.
6. **Rabbit holes** — known traps to avoid (Shape Up's ingredient; cheap insurance).
7. **Constraints** — stack, deployment target, hard external dependencies.
8. **Open questions** — unresolved, with what would resolve each.

### B. Roadmap — stepstone

- **Milestone** = an outcome ("Documentation is ready"), with **acceptance criteria in its
  description**. No status, no date — stepstone deliberately gives milestones neither.
- **Task** = one actionable unit, one sentence, with its own description.
- **Group** = horizon: `Now`, `Next`, `Later`.
- **Dependency edges** = must-land-before (logical *or* "these two would collide in the same files").
- **Order** = canonical file order within a horizon, changed with `move`.

### C. Per-item shape

Shape Up's five ingredients per item, distributed onto what exists — no new fields:

| Ingredient | Where it goes |
|---|---|
| Problem | task `description`, first line |
| Appetite (time box) | task `description`, stated as a size class (`small` ≤1 session, `medium` ≤1 week) |
| Solution sketch | task `description`, or a linked doc when it needs a diagram |
| Rabbit holes | task `description` bullet |
| No-gos | task `description` bullet |

Items too small to need a sketch simply carry a one-line description. **Not every task gets
all five** — that is the Fowler/Böckeler lesson (a small bug became 4 user stories / 16
acceptance criteria and the agent ignored the notes anyway).

## 4. Field mapping — what stepstone actually stores

Verified against `docs/cli.md` and `docs/goals.md`, 0.12.1.

| Intent | stepstone surface | Notes |
|---|---|---|
| Project identity | `project configure "<title>" --confirm [--repository <url>]` | Also upgrades the store to v2 |
| Outcome / release lane | `project add_milestone "<outcome>" --description "<acceptance criteria>"` | No status, no date |
| Unit of work | `project add "<title>" --description "<shape>"` | ID derived from title, then frozen |
| Horizon | `--group Now\|Next\|Later` | Free-form group; a group exists iff a goal names it |
| Blockers | `--depends-on <id>` | Repeatable; an `update` **replaces** the whole set |
| Order in horizon | `project move <id> up\|down\|before\|after` | Order is canonical, not incidental |
| In flight (max one) | `project set_active <id>` | Warns but allows a blocked goal |
| Branch claim | `project start <id> [--branch <name>]` / `--clear` | A claimed goal leaves `ready` |
| Evidence links | `--link <absolute http(s) url>` | PR, spec, doc; informational only |
| Done / settled | `project complete <id> --confirm` / `archive` | **Always requires explicit intent** |
| Batch seeding | `project apply-plan <plan.json>` (`--dry-run` first) | Plan entries allow only `title`, `description`, `group`, `dependsOn` |
| What to start | `project next` / `ready` / `waves` | `ready` = parallel frontier; `waves` = earliest layer each |
| Concurrency guard | `--expect-revision`, `--expect-updated-at` | Conflict instead of overwrite |

**Not available, and therefore designed around:**

| Missing | Consequence |
|---|---|
| Priority field | Horizon (group) + file order express it |
| Dates / targets | No scheduling in the artifact; the *cadence* is the time axis |
| Per-item progress % | Derived by the render step (done/total tasks per milestone) |
| Per-milestone status | Derived |
| Owners / teams | Out of scope; a solo project has one team |

## 5. The confidence lifecycle (RSI parity) — derived, never stored

RSI's three states carry specific meaning: **Committed** = *"has passed the final review
process. There is a very low chance of this deliverable being pushed back"*; **Tentative** =
*"hasn't gone through the review process and may shift around"*; **Released** = shipped.

Mapping onto the roadmap, computed on every read:

| State | Derivation |
|---|---|
| **Released** | status is `done` |
| **Committed** | group is `Now` **and** every `dependsOn` edge has landed (i.e. it is in `ready`) |
| **Tentative** | group is `Now` with unsatisfied edges, or group is `Next` |
| **Not scheduled** | group is `Later`, or ungrouped |

Storing it would go stale the moment a dependency lands — which is precisely why stepstone
derives `blocked` on every read instead of persisting it. Same rule here.

## 6. Sequencing rules

1. **Walking skeleton first.** Wave 1 is the thinnest end-to-end path: repo, CI, one deploy
   path, one observable signal, one vertical feature. DORA's finding is that AI gains
   concentrate in *loosely coupled architectures with fast feedback* — the skeleton is what
   buys that, and everything after it is cheaper.
2. **Vertical slices, not layers.** Each `Now` task carries its own tests and docs. This is
   "context-centric decomposition": the agent that implements a slice also owns its tests,
   because it already holds the context.
3. **A hidden prerequisite is its own task.** If a slice needs infrastructure first, that is
   a separate task with an edge — never a footnote inside another task.
4. **`waves` is an ordering check, not a fan-out plan.** For one developer, "how much can run
   in parallel" is mostly "what order avoids rework", and an unreachable goal is a bug in the
   roadmap rather than a busy queue.

## 7. The honesty rules

1. **One committed horizon.** Only `Now` drives work. `Next` and `Later` are explicitly
   re-shapeable, and moving something down is a normal, cheap edit — not a failure.
2. **Fixed appetite, variable scope.** An item that does not fit its stated size class is cut
   or re-shaped. It is never extended. (Shape Up's circuit breaker; the failure is blamed on
   shaping, not execution.)
3. **Re-shape on a cadence**, not on impulse: roughly every 6 weeks early in a project, then
   quarterly. A re-shape is a batch of `move`/`update`/`archive` calls in one commit.
4. **Ship the caveats with the artifact.** The charter and the rendered view both state that
   everything beyond `Now` is tentative and may move.
5. **Single source of truth.** The roadmap owns *what next*; OpenSpec specs own *how it must
   behave*. The roadmap **links** specs by URL and never restates them.
6. **Completion is an explicit act.** `--confirm` only, never inferred from "it looks done" —
   which is also stepstone's own rule and this setup's Rule 1.

## 8. The ritual, in order

1. **Charter draft** — the agent drafts `docs/PROJECT.md` from the user's description and
   brings the contested parts back as Rule 1 questions.
2. **Enumerate outcomes** — milestones with acceptance criteria in their descriptions.
3. **Decompose** — walking skeleton first, then vertical slices; one sentence per task;
   `dependsOn` edges recorded as the tasks are defined.
4. **Assign horizons** — only the first ~1–2 weeks land in `Now`.
5. **Seed atomically** — write the plan JSON, run `project apply-plan --dry-run`, show the
   projected IDs and waves, get explicit approval, then **one** `apply-plan` call.
6. **Confirm the shape** — run `project waves`; report any unexpected ready work or
   unreachable goal instead of accepting the order silently.
7. **Commit** both the charter and `.worklist/worklist.json`.
8. **Then** per-task work proceeds exactly as today: `project next` → plan mode → OpenSpec
   change → OpenSpec archive.

## 9. The render step (later increment)

Input: `project structure --json` plus `project waves --json`. Output: an RSI-shaped view —
milestones as lanes with **derived** progress (done/total tasks), each task carrying its
**derived** confidence state, its dependencies, and its branch/PR links, under a caveats
header. Generated, never hand-edited, mirroring how stepstone generates its own
`docs/ROADMAP.md` from the very file it commits. Output format still open (§10).

## 10. Open decisions for Miguel

1. **Groups = horizons (`Now`/`Next`/`Later`) or groups = teams?** I recommend horizons: the
   RSI "teams" axis is meaningless for one developer, and the horizon axis is the one that
   solves "what do I work on today".
2. **Where the ritual lives** — a pi prompt template (like `/kickoff`) or a cross-harness
   Agent Skill. Note stepstone already publishes a skill (`npx skills add
   max-miller1204/stepstone --skill stepstone -g`); ours would be a *second*, ritual-level
   skill or a template that references it.
3. **Render format** — markdown in-repo (`docs/ROADMAP.md`), a static HTML page, or both.
4. **Charter location** — `docs/PROJECT.md` vs a doc linked from the project.

## 11. Explicitly out of scope

- No execution loop, no auto-continue, no auditor (rejected with `pi-goal-x`).
- No dates or scheduling. The cadence is the time axis.
- No priority field — horizon plus order carries it.
- No teams/owners axis.
- No fork of stepstone. If a stored confidence or progress field ever becomes necessary, that
  is a separate decision with its own proposal.
- Existing projects are untouched.

## 12. Correction after dry-running against the installed 0.12.1

Validated in a throwaway Git repo (`/tmp/ritual-check2-20261015`), not on any real project.

### 12.1 The milestone layer does not exist in the published package

The CLI's complete action list is `list · show · find · next · ready · waves · ui · web ·
add · apply-plan · update · move · start · set_active · complete · reopen · archive ·
delete · migrate_ids · migrate_path · workspace · help`. There is **no `configure`,
`add_milestone`, `update_milestone`, `assign_milestone`, or `structure`**, and `--version`
is not a flag. The `docs/organization.md` and `docs/usage.md` organization tables describe a
**not-yet-published release**; the store never upgrades past `version: 1`.

**Consequences:**
- **§3B milestone and §4 "outcome / release lane" are unavailable today.** There is exactly
  one grouping axis available: `group`. Since the horizon is what actually changes behaviour,
  **`group` carries the horizon (`Now`/`Next`/`Later`) and the outcome/release lane is dropped**
  until organization ships.
- RSI's *Release View* maps onto the **`Now` group** rather than onto milestones — which is a
  fair analogue anyway (the committed horizon plays the role of "the next three months").
- The render step (§9) loses its per-milestone rollup: progress becomes *per horizon*
  (done/total within `Now`), and the confidence states derive from group + dependency state.

### 12.2 The horizon group is display-only — this is the design's main risk

Verified behaviour: with `reporting-and-exports` in group `Later` and no dependencies, it
appeared in **Wave 1** and in **`ready`**. `ready`, `next`, and `waves` derive only from
`dependsOn` edges; they never consult `group`. `--group` is documented for `list`, `add`, and
`update` only, so `ready` cannot be filtered by horizon by the tool.

**Consequences:**
- "Only `Now` drives work" (§7 rule 1) is **not enforced by stepstone**. It must be enforced
  by the driver convention and by the ritual:
  > Start work only from `project ready --json`, filtered client-side to goals whose `group` is
  > `Now`. Never start a goal from another group, even when `ready` offers it.
- A roadmap whose `Later` items are unblocked will constantly *advertise* them as ready. If that
  proves distracting in practice, the mitigation is to give every non-`Now` goal a single
  artificial edge on a `now-complete`-style gate goal — deferred, because it serializes the
  graph and contradicts "a dependency must mean must-land-before".
- This also means the render step's confidence derivation must be computed from
  (group, dependency state), never read from the tool.

### 12.3 Verified working (so the rest of the design stands)

- `apply-plan --dry-run` projects IDs without writing (`meta.changed: false`); batch-internal
  `dependsOn` entries resolve by title slug into real IDs; one `apply-plan` = one atomic
  revision.
- `waves` produced the expected 5-layer schedule with `unreachableGoals` absent.
- `next` returned exactly one goal (the first of `ready`, by definition, not a second
  calculation).
- `project list --group <name>` filters by horizon correctly.
- The artifact is `.worklist/worklist.json` — `{version, revision, goals[]}`, 2.5 KB for 8 goals,
  each goal carrying id/title/description/group/status/createdAt/updatedAt. Safe to commit.

### 12.4 Open questions this raises

1. Since milestones are unavailable, is `group` = horizon still the right choice, or should
   `group` carry the *outcome* and horizon live only in ordering? (Recommendation: horizon —
   it is the axis that changes what happens next.)
2. Do we accept "the driver filters `ready` by group" as the enforcement, or wait for the
   organization release before adopting the ritual at all?
3. Should the ritual pin a released version and re-check for the milestone layer on upgrade?

## 13. Decisions locked (2026-10-15)

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | What `group` carries | **Horizon** (`Now`/`Next`/`Later`), with the feature as a title prefix (`Billing — plans and checkout`) | Only one grouping field exists. Horizon changes behaviour; the feature prefix gives the boss-facing view its lane without a second store. Cost: longer titles and derived IDs. |
| 2 | Enforcing the committed horizon | **A driver rule**, not tooling: start only from `project ready --json` filtered to `group == Now` | `ready`/`next`/`waves` ignore `group` entirely and will advertise an unblocked `Later` goal today (verified in §12.2). Artificial gate edges would enforce it mechanically but write false "must-land-before" edges and over-serialize the plan. |
| 3 | Where the ritual lives | **An Agent Skill**, written directly to `~/.pi/agent/skills/project-start/` — never installed via `npx skills add` | Cross-harness (Claude Code/Cursor/Codex profiles exist here, and stepstone itself ships guidance as a skill); the ritual needs supporting files, which a skill directory holds and a one-file prompt does not; it is trigger-based rather than a command to remember. The CLI updater silently reverts local edits to managed skills, hence writing it directly. |
| 4 | Rendered view | **One self-contained local HTML file**, generated, never published by default | "Pretty like the Star Citizen roadmap" for the user's bosses. Several projects here are client work, so publishing a feature roadmap is a confidentiality decision that is not ours to take by default; a file or screenshot needs no publishing path. If a URL is ever wanted, that is a separate decision (e.g. self-hosted GitLab Pages). |

### Built as part of this decision

| Artifact | Path |
|---|---|
| The ritual | `~/.pi/agent/skills/project-start/SKILL.md` |
| Charter template | `~/.pi/agent/skills/project-start/references/charter-template.md` |
| Plan-JSON schema, worked example, honesty rules | `~/.pi/agent/skills/project-start/references/roadmap-shape.md` |
| HTML renderer (dependency-free Node ESM) | `~/.pi/agent/skills/project-start/scripts/render-roadmap.mjs` |
| Sample render of the 10-goal fixture | `roadmap-render-sample.png` (this directory) |

Verified end to end: seeded an 8-goal roadmap through `apply-plan` (dry-run then one atomic
write), rendered a 10-goal fixture covering released/blocked/dangling-edge/link cases, and
confirmed the output visually in a browser. The renderer emits a single file with no external
assets and no network references.

### Still open

1. **Re-check on upgrade:** milestone entities and `--expect-revision` are described in the
   repo docs but absent from 0.12.1. If a later release ships them, revisit whether milestones
   should carry the outcome lane instead of a title prefix.
2. **Publishing path** for the HTML, if a clickable link is ever wanted.
3. **Pilot:** the ritual is scoped to new projects, so it stays a paper artifact until the next
   one starts. A scratch-repo rehearsal is possible if wanted.
