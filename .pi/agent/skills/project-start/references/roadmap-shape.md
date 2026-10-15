# Roadmap shape, seeding, and the honesty rules

## What stepstone actually stores (0.12.1 — verified)

A goal is `{id, title, description, group, status, createdAt, updatedAt}` plus optional
`completedAt`, `links`, `branch`, `dependsOn`. Statuses are `open`, `active`, `done`,
`archived`. The store is `.worklist/worklist.json` (`{version, revision, goals[]}`), committed
alongside the code.

**Not available in the published package** (the docs describe a not-yet-released organization
layer — do not design around it): `configure`, `add_milestone`, `update_milestone`,
`assign_milestone`, `structure`, milestone entities, a priority field, any date field, any
per-item progress field, and `--expect-revision`.

## Plan JSON schema

`project apply-plan <plan.json>` accepts a plain JSON array. Each entry allows **exactly**:

| Key | Required | Notes |
|---|---|---|
| `title` | yes | Non-empty. The ID is derived from it and frozen, so the title carries the feature prefix. |
| `description` | no | Where the Shape Up ingredients go. |
| `group` | no | The horizon: `Now`, `Next`, or `Later`. |
| `dependsOn` | no | Array of goal references that must land first. |

Within a batch, a `dependsOn` reference resolves first by exact title slug of another entry in
the same batch, then by exact current or former goal ID. Links and milestones cannot be set
through a plan — add links afterwards with `project update <id> --link <url>`.

## Worked example

```json
[
  { "title": "Foundations — repo, CI gate and staging deploy",
    "group": "Now",
    "description": "Problem: nothing ships yet. Appetite: small. Rabbit hole: pipeline config spelunking. No-go: no production deploy in this goal." },
  { "title": "Foundations — observability baseline",
    "group": "Now",
    "dependsOn": ["foundations-repo-ci-gate-and-staging-deploy"],
    "description": "Structured logs, error capture, one dashboard. Appetite: small." },
  { "title": "Foundations — data model and first migration",
    "group": "Now",
    "dependsOn": ["foundations-repo-ci-gate-and-staging-deploy"],
    "description": "Schema for the core entity. Appetite: medium. No-go: no speculative tables." },
  { "title": "Onboarding — signup and session",
    "group": "Now",
    "dependsOn": ["foundations-data-model-and-first-migration"],
    "description": "A real user can create an account and stay logged in. Appetite: medium." },
  { "title": "Onboarding — first feature end to end with tests",
    "group": "Now",
    "dependsOn": ["onboarding-signup-and-session"],
    "description": "Vertical slice; the slice owns its tests. Appetite: medium." },
  { "title": "Admin — user management surface",
    "group": "Next",
    "dependsOn": ["onboarding-first-feature-end-to-end-with-tests"] },
  { "title": "Billing — plans and checkout",
    "group": "Next" },
  { "title": "Reporting — exports",
    "group": "Later" }
]
```

Note the first entry has no `dependsOn`: it is the walking skeleton, and it is the only thing
that should be in wave 1.

## Derived states (never stored)

The renderer and any dashboard compute these on every read. Storing them would go stale the
moment a dependency lands — the same reason stepstone derives `blocked` per read instead of
persisting it.

| State | Derivation |
|---|---|
| **Released** | `status` is `done` or `archived` |
| **Committed** | `group == Now` and every `dependsOn` target has landed |
| **Tentative** | `group == Now` with unmet dependencies, or `group == Next` |
| **Not scheduled** | `group == Later`, or ungrouped |
| **Blocked** | a chip shown independently: at least one `dependsOn` target has not landed |

## The honesty rules

1. **One committed horizon.** Only `Now` drives work. `Next` and `Later` are re-shapeable by
   design, and the renderer says so out loud.
2. **Never start from raw `ready`.** Filter to `Now`. `ready` reports the dependency frontier
   only; a `Later` goal with no prerequisites is advertised there today — verified.
3. **Fixed appetite, variable scope.** A goal that did not fit its stated appetite is cut or
   re-shaped, never extended.
4. **Re-shape on a cadence** — roughly every 6 weeks early, then quarterly — as a batch of
   `move` / `update` / `archive` calls in one commit.
5. **Ship the caveat.** The rendered view carries the caveats header. Everything beyond `Now` is
   tentative.
6. **Single source of truth.** The roadmap owns *what next*. OpenSpec specs own *how it behaves*.
   Link with `--link <url>`; never restate a spec's contents in a goal description.
7. **Completion is an explicit act** — `--confirm`, never inferred.

## Commands worth knowing

```sh
stepstone project ready --json          # dependency frontier (filter to Now yourself)
stepstone project next --json           # the first ready goal
stepstone project waves --json          # dependency layers — the shape of what is left
stepstone project list --group Now --json
stepstone project start <id> --branch feat/<topic>   # claim it on a branch
stepstone project complete <id> --confirm
stepstone project update <id> --link https://...     # link a spec or PR
stepstone project move <id> before <other-id>
```

Exit codes: `0` success, `1` error, `2` usage, `3` confirmation required, `4` conflict.
