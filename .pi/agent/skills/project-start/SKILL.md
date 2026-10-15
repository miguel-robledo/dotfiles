---
name: project-start
description: Run the one-time project-start ritual on a NEW project — draft the charter, decompose the roadmap into horizon-labelled goals with dependencies, seed them into the stepstone worklist, and generate the boss-facing HTML roadmap. Use when starting a project from scratch, or when the user asks to plan a whole project up front. Use it in ADOPT mode on an existing project to reconstruct the charter from the repo's own docs, seed only forward work, and render the delivered record from openspec/changes/archive. Do NOT use for adding a single feature, or for per-task planning (that is plan mode plus an OpenSpec change).
---

# Project-start ritual

One ritual, once per project, before any feature work. Its output is a **charter** and a
**roadmap**; from then on, work starts from the roadmap instead of from what feels urgent.

Planning here is deliberately shallow. The evidence is that planning returns saturate
(planning quality correlates ~R²=0.33 with success at a 20–33% effort budget) and that
*changing* plans is what moves outcomes (Dvir & Lechler 2004). Shape the **shape**, not the
schedule.

## What the evidence forbids

- **Do not plan every task in detail.** Shape only what is bettable; leave the rest coarse.
  Every Shape Up ingredient on every task is the failure mode — a small bug became 4 user
  stories and 16 acceptance criteria in a documented hands-on review, and the agent ignored
  the notes anyway.
- **Do not commit beyond one horizon.** Shape Up refuses a project roadmap outright; Kubernetes
  prunes milestone items that miss the freeze.
- **Do not invent dates.** stepstone stores none, and fixed time/variable scope is the
  supported pattern.
- **Do not write a second source of truth.** The roadmap owns *what next*; OpenSpec specs own
  *how it must behave*. Link, never restate.

## Conventions (locked 2026-10-15)

| Convention | Rule |
|---|---|
| **Horizon** | The `group` field carries exactly one of `Now`, `Next`, `Later`. Capitalised, exact. |
| **Feature / lane** | Prefix the title with the feature and an em dash: `Billing — plan selection and checkout`. The renderer splits on ` — ` to group your boss-facing view. |
| **Title length** | An ID is the title's slug, **capped at 40 characters** and then cut back to the last hyphen. Keep a title short enough that the cap lands on a word boundary, or the ID ends mid-phrase (`help-centre-self-service-docs-and-the`). Read the IDs back from the dry run; **never derive one by hand** — an over-long `dependsOn` reference fails `apply-plan` with `VALIDATION_FAILED`. |
| **Evidence links** | Every goal gets a `--link` to the thing that proves it: a PRD anchor, an OpenSpec spec or change, an issue. A goal whose description cites a PRD section or a bug ID but carries no link is half-recorded. |
| **One committed horizon** | Only `Now` drives work. |
| **Driver rule** | **Never start work from raw `project ready`.** `ready` answers "what has no unfinished prerequisites", not "what have I committed to". A `Later` goal with no dependencies appears in `ready` today — verified. Start only from `project ready --json` filtered to `group == "Now"`. |
| **Completion** | `project complete <id> --confirm` only. Never inferred from "it looks done". |
| **Re-shaping** | `move`, `update`, and `archive` are normal, cheap, and expected. Moving something down is not a failure. |

## The ritual, in order

### 1. Draft the charter — `docs/PROJECT.md`

Use `references/charter-template.md`. The charter exists because stepstone cannot store any of
it: a worklist has no project title, no problem statement, no invariants.

Bring anything contested back as a Rule 1 question rather than deciding it. In particular, the
**non-goals** and the **boundaries** are the parts future work will be measured against.

### 2. Enumerate outcomes

List the milestones the project must reach as outcomes, each with acceptance criteria: *"a real
user can complete the core flow unaided"*, not *"build the auth module"*.

### 3. Decompose into goals, walking skeleton first

- **Wave 1 is the walking skeleton**: repository, CI gate, one deploy path, one observable
  signal, one vertical slice end to end. Everything after it is cheaper, and the AI-era gains
  that DORA measures concentrate in loosely coupled systems with fast feedback.
- Then **vertical slices**, not layers. The slice that implements a feature owns its tests and
  docs, because it already holds that context.
- **One sentence per goal.** If a goal needs a paragraph, it is two goals.
- A hidden prerequisite is its **own goal with a dependency edge** — never a footnote.
- Shape only the goals in `Now`. For those, put Shape Up's ingredients in the description:
  `Problem:` / `Appetite: small|medium` / `Rabbit hole:` / `No-go:`. `Next` and `Later` goals
  get a title and, at most, one line.

### 4. Assign horizons

Only the first one to two weeks of work lands in `Now`. Everything else is `Next` or `Later`.
This is the step that makes the roadmap do its job — an honest `Now` is small.

### 5. Seed atomically, after approval

Write the plan JSON (schema and a worked example: `references/roadmap-shape.md`), then:

```sh
stepstone project apply-plan plan.json --dry-run --json   # projected IDs, writes nothing
stepstone project apply-plan plan.json --json             # one atomic revision
```

Show the projected IDs from the dry run and get an explicit yes before the real call. Batch
`dependsOn` entries may name another goal in the same batch by its title slug — the run resolves
them. After it lands, run `stepstone project waves --json` and report any surprise: unexpected
ready work, or a goal reported as unreachable.

### 6. Link every goal to its evidence

Seeding is not finished when the goals land. A goal's description cites a PRD section, an
OpenSpec change or a bug ID, and a citation in prose is not a reference — nobody can click it,
and the renderer shows an unlinked goal as `no links recorded`. Link each one straight after the
seed, while the mapping is still in your context:

```sh
stepstone project update <id> --link https://<host>/<repo>/-/blob/master/openspec/specs/<capability>/spec.md
stepstone project update <id> --link <url-of-the-prd-anchor>
stepstone project update <id> --link <url-of-the-archived-change-or-issue>
```

A plan JSON cannot carry links — `apply-plan` accepts only `title`, `description`, `group` and
`dependsOn` — so this is always a second, separate pass. Use the IDs the dry run printed. Where
nothing public exists to point at (a local change directory, a PRD that lives in the repo),
link the closest real artifact rather than inventing a URL.

### 7. Commit and render

Commit `docs/PROJECT.md` and `.worklist/worklist.json` together. Then generate the boss-facing
view:

```sh
node ~/.pi/agent/skills/project-start/scripts/render-roadmap.mjs \
  --title "<Project name>" --out docs/roadmap.html
```

Commit `docs/roadmap.html` too if the user wants it shared. It is a single self-contained file:
no external assets, no network, safe to send. **Do not publish it** — several projects here are
client work, and a published roadmap exposes a client's feature set. A file or a screenshot is
the default; hosting is a separate, explicit decision.

### 8. Stop planning

Per-task work then proceeds exactly as before: `project next` → plan mode → OpenSpec change →
OpenSpec archive. The ritual does not add an execution loop, an auto-continue, or a goal runner.
None of those exist here on purpose.

## Adopting on an existing project (ADOPT mode)

Use when the project already exists and the user wants the roadmap going forward. The operation is
different from the greenfield ritual: **backfill the past from evidence, decide only the future.**

### Read first — never invent

| Source | Tells you |
|---|---|
| `<repo>/AGENTS.md` | boundaries, invariants, conventions (often the charter's §4 already) |
| `openspec/config.yaml` | stack, constraints, project context |
| `openspec/specs/*/spec.md` | the capability vocabulary — what the system must do |
| `openspec/changes/*/` **not** in `archive/` | real in-flight work — the honest `Now` candidates |
| `openspec/changes/archive/*/` | the delivered record (`proposal.md`, `design.md`, `tasks.md`) |
| `docs/product/*`, README | product intent, if it exists |

### Rules

1. **Forward-only goals.** Seed only work that is *not done*: the active changes as `Now`, plus what
the user names as `Next`/`Later`. **Never seed archived changes as goals** — 88 archived changes
become an unusable board, and 45 capabilities as "done" goals is a changelog, not a roadmap.
2. **Never invent `Next`/`Later`.** Those come from the product docs and the user's answers. An
agent-invented horizon is a fabricated roadmap presented as real.
3. **The past is rendered, not stored.** Pass `--archive` to the renderer so the delivered record
appears as evidence. It is derived on every read and is never a goal.
4. **The charter is a "charter as of today".** Assemble it from the sources above and mark which
sections are reconstructed rather than decided. If no source states the problem, ask — do not
invent one.
5. **Client repos get a branch.** If the repo auto-deploys from `master`, do the pilot on a branch
and land it through the project's normal review. New files in a client repo are the user's
call, not yours.

### Then

Seed with the same atomic path as the greenfield ritual (§5), link each goal to its evidence
(§6), run `waves`, and render with `--archive`:

```sh
node ~/.pi/agent/skills/project-start/scripts/render-roadmap.mjs \
  --title "<Project name>" --archive openspec/changes/archive --out docs/roadmap.html
```

## During the project

- **Daily:** start from `ready` filtered to `Now`. If `Now` is empty, that is a re-shaping
  decision, not a reason to dip into `Next`.
- **On a cadence** (roughly every 6 weeks early, then quarterly): re-shape. Move completed
  outcomes out, promote from `Next`, archive what is no longer wanted, re-render.
- **On drift:** if a goal did not fit its stated appetite, cut or re-shape it. Never extend the
  appetite — that is the circuit breaker, and it is the whole point of stating one.
- **Answering "what shipped, and how does this behave today?":** ask the CLI, never read
  `openspec/changes/archive/` by hand. `openspec show <change>` for an **active** change;
  `openspec list --specs` then `openspec show <spec>` for a living spec.
  **Mind the boundary:** neither resolves an *archived* change — `show` resolves active changes and
  specs only, and `list` omits the archive entirely. For delivered work the archive on disk is the
  record, and `docs/roadmap.html` links each delivered change to the spec it merged into. Answer
  from the **living spec**, not the archived proposal: the spec is the current truth and the
  proposal is only its history.

## Files in this skill

| File | Purpose |
|---|---|
| `references/charter-template.md` | The `docs/PROJECT.md` skeleton |
| `references/roadmap-shape.md` | Plan-JSON schema, a worked example, and the honesty rules |
| `scripts/render-roadmap.mjs` | Reads `.worklist/worklist.json` → self-contained HTML |
