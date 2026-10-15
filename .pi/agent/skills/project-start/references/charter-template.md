# Charter template — `docs/PROJECT.md`

Fill this in at project start and keep it current. Every section is here because something
downstream depends on it; delete a section only if it genuinely does not apply.

```markdown
# <Project name> — charter

Created: <YYYY-MM-DD>. Roadmap: `.worklist/worklist.json`. Rendered view: `docs/roadmap.html`.

## Problem

<One paragraph. What is broken or missing, for whom, and why now. No solution yet.>

## Users

<Who specifically. Name the exact segment, not "users" — Amazon's PR/FAQ insists on it
because a roadmap for everybody is a roadmap for nobody.>

## Success criteria and feedback signal

<What "working" means, and — separately — what will *tell* us it is working. A goal without a
feedback signal cannot be evaluated, and committed goals without feedback are what
"Goals Gone Wild" documents: cheating, narrowed focus, distorted risk-taking.>

| Criterion | How we will know |
|---|---|
| <outcome> | <measure, log, dashboard, or observed behaviour> |

## Boundaries and invariants

<The durable rules that outlive any single task — the architectural decisions future work must
not quietly violate. This is the equivalent of coloso-v2's "Coloso split". Be specific enough
that a later contributor (human or agent) can tell when they are breaking one.>

## Non-goals

<Explicit. These are what scope creep gets measured against — without them there is nothing to
point at when a task quietly grows.>

## Rabbit holes

<Known traps, with the specific wrong turn each one represents. Cheap insurance: one line here
saves a week of "why is this taking so long".>

## Constraints

<Stack, deployment target, hard external dependencies, anything fixed by someone who is not us.>

## Open questions

<Unresolved, each with what would resolve it. An open question with no resolution path is a
decision waiting to be made badly.>

| Question | What resolves it |
|---|---|
| <question> | <spike, measurement, or a person to ask> |
```

## Notes

- The charter is **not** a specification. Behaviour belongs in OpenSpec specs; the charter says
  what the project is for and what it will not do.
- Keep it short enough to re-read at the start of a session. If it grows past a couple of pages,
  the detail belongs in the specs.
- Re-shape it on the same cadence as the roadmap. A charter that contradicts the roadmap is
  worse than either one alone.
