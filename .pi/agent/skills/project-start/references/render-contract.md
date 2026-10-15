# Render contract — what the roadmap page must show

This file is the requirement. `scripts/render-roadmap.mjs` is one implementation of it.
It exists because the first pilot produced a page that was technically correct and useless: every
goal's description was dropped, dependencies were a bare count, and nothing was clickable. If a
future change makes the page "simple" again, this is the list it failed.

**Changing the renderer? Keep every item below true, or say explicitly which one you dropped and
why.** If an item conflicts with looking good, raise it rather than silently dropping a row.

## Non-negotiable shape

1. **One file.** Inline CSS; inline vanilla JS only where interaction needs it. No external
   assets, no CDN, no fetched fonts, no network requests of any kind.
2. **Opens from the filesystem** (`file://`) and **prints legibly**.
3. **Self-contained inputs:** `.worklist/worklist.json`, plus optionally
   `openspec/changes/archive/` and `openspec/specs/`. Nothing else.
4. **Derived states only.** Committed / Tentative / Not scheduled / Released are computed on every
   render and never stored, never asserted from the file. Storing them goes stale the moment a
   dependency lands.

## Required content

| # | Requirement |
|---|---|
| 5 | **Caveats banner** — only `Now` is committed; `Next` and `Later` are tentative and may move. |
| 6 | **Status legend with definitions** (Committed = in Now with no unmet dependency; Tentative = not yet through review, may move; Not scheduled = Later or ungrouped; Released = done). An undefined "Tentative" reads as incompetence. |
| 7 | **Stats count two different things separately:** roadmap goals by state, and delivered changes. Never one unlabelled "Released" number — it contradicts the delivered section below it. |
| 8 | **Horizon lanes** (Now / Next / Later / Ungrouped) with per-lane progress and a committed vs tentative note. |
| 9 | **Per goal:** feature label, title, derived state, dependencies **by name in both directions** ("blocked by X", "unblocks Y"), dates (`createdAt`/`updatedAt`), branch if claimed, links, and the **goal ID in a copy-friendly form** (the IDs are ~40-char slugs and you need them to drive the CLI). |
| 10 | **Per goal: the full description.** This is where the `Problem:` / `Appetite:` / `Rabbit hole:` / `No-go:` lines live. Dropping it was the single biggest regression in the pilot — ~2 KB of real content. |
| 11 | **Detail affordance:** click or expand a card to see the above without leaving the page. |
| 12 | **A second axis plus a state filter:** filter/group by feature prefix (and horizon, and state), not horizon alone. Fine at 7 goals; necessary at 40. |
| 13 | **Delivered section**, dated, **grouped by month**, read from `openspec/changes/archive/`, with a count and the date range. Grouping shows delivery cadence, which is the point for the audience. |
| 14 | **Links to the charter** (`docs/PROJECT.md`) and to the repository. |
| 15 | **Capability summary** when `openspec/specs/` exists: capability count and requirement count. |
| 16 | **Delivered items are detail-bearing too.** Expanding a delivered change shows: the `## Why` paragraph, the capabilities it merged into (from `specs/<capability>/`), its task count (`tasks.md` checkboxes, done/total), and the date. An undifferentiated 88-tile grid is a wall, not a record. |
| 17 | **No link may point at a `.md` file.** Not the charter, not a capability spec, not a proposal. A browser renders raw markdown as an unstyled dump, which is worse than showing nothing. Markdown that is worth reading must be **rendered into the page** (row 18). |
| 18 | **Markdown is rendered by the renderer, at render time, in Node** — not fetched, not parsed in the browser. Escape `&`, `<`, `>` in the source first, then convert this subset: `#`–`####` headings, paragraphs, `-`/`1.` lists, `- [x]`/`- [ ]` checkboxes, `**bold**`, `` `code` ``, fenced ``` blocks, `>` quotes, `|` tables, `---` rules, and `[text](url)` links. Input is our own repo docs, so the subset is known and stable — but escape first regardless. |
| 19 | **What gets rendered, and what cannot.** Given the real sizes (charter 10 KB; all 45 capability specs **1,018 KB**; 88 proposals 592 KB; 88 designs 1,060 KB), a sendable single file cannot hold full spec text. So: render the **charter in full**, each delivered change's **`## Why`** (and `## What Changes`, ~600 chars each ≈ 53 KB for 88), and per capability its **requirement titles** (587 × ~60 chars ≈ 35 KB). Never embed whole `spec.md` or `design.md` corpora behind an always-on flag; if that depth is ever wanted, it is `openspec show <change>` in a chat session, not this page. |
| 20 | **An in-page anchor must land somewhere visible.** If the target is a collapsed `<details>`, following the link must **open it**; the landed-on entry must be **visually marked**; and anchored elements carry `scroll-margin-top` so a sticky header cannot cover them. A link that scrolls to a one-line collapsed row sitting immediately above an unrelated big heading reads as "it took me somewhere wrong" — the failure that shipped: 45 `<details>` collapsed, and no `hashchange`/`location.hash` handling at all. |
| 21 | **A chip inside an expanded item reveals its target in place — it is neither a teleport nor an inert label.** Both extremes have shipped and both were wrong: first it jumped the reader to a collapsed row next to the charter, then it stopped being clickable at all. Implement **clone-in-place**: clicking the chip reveals the canonical requirement list (cloned from the capability index's `<details id="cap-…">`) directly beneath the chip, toggling on and off. No markup duplication in the file, no navigation, no network. |

## What detail is available per delivered change

Each `openspec/changes/archive/YYYY-MM-DD-<slug>/` directory carries:

| File | Use it for |
|---|---|
| `proposal.md` | `## Why` (≈600 chars), `## What Changes`, `## Capabilities` → `### New/Modified Capabilities`, `## Impact` |
| `specs/<capability>/spec.md` | the capability delta — which living spec this change merged into |
| `tasks.md` | checkbox counts: `^\s*-\s*\[[ x]\]`. Across the Coloso archive: **1892/2231 ticked (85%)** |
| `design.md` | decisions and rationale, for opt-in depth |
| directory name | the date and the canonical slug |

**Size discipline — read this before embedding text.** The first estimate here was 88 changes × ~650 chars ≈
57 KB, so "the whole page stays around 100–130 KB". **Measured reality after the first full render:
239 KB** — 88 delivered entries × ~1.5 KB of detail, plus the 45-capability index with 612 requirement
lines. That is still fine to open and fine to email, so treat **~250 KB as the ceiling**, keep the
full-text toggle opt-in (`--delivered-detail full`), and **print the resulting file size in the render
log** so nobody emails a megabyte by accident. Never embed whole `spec.md` or `design.md` corpora.

## Verification before claiming it works

Run these every time the renderer changes; they are cheap and they catch the regressions above.

```sh
node ~/.pi/agent/skills/project-start/scripts/render-roadmap.mjs \
  --title "<Project>" --out /tmp/roadmap-check.html      # never write over the real one first
```

- Delivered entry count **equals** the number of `YYYY-MM-DD-*` directories in the archive.
- Goal count and per-lane counts **equal** the worklist (`group` values, exactly).
- Blocked chips **equal** the number of goals with at least one unmet `dependsOn`.
- Every goal's description text appears in the HTML (spot-check the longest one).
- Every goal ID appears in the HTML.
- Open it in a browser: expand one card, filter to one feature, print-preview once.
- No asset references: `grep -oE '(src|href)="[^"]*"' <file> | grep -v '^href="https\?://'` should
  return nothing but intentional in-page anchors.
- Every delivered item exposes a why-paragraph (count of why blocks == archive count), and the
task-tick totals across the page equal `1892/2231` for the Coloso archive — if they differ, the
checkboxes are being mis-parsed.
- **Zero raw markdown links:** `grep -oE 'href="[^"]*\.md(#|")' <file>` returns nothing. This is
the check that the "opens as a plain md file" complaint cannot come back.
- The charter's section headings appear as real HTML headings (`<h2>Problem</h2>` etc.), i.e. it was
  rendered rather than pasted.
- **Anchors work, not merely resolve.** In a browser, click three different `#cap-*` links from
  three different places (a delivered item's chip, the capability index, and a goal card): each
  must **open** its entry, be **visible** below any sticky header, and be **marked**. Check the
  **last** anchored entry specifically — it is the one that sits next to the section after it, and
  it is the case that failed.
- The rendered file size is reported by the renderer itself.

## What this contract deliberately does not require

- **No dates on the roadmap itself.** stepstone stores none, and fixed time / variable scope is the
  supported pattern. The cadence is the time axis.
- **No per-milestone rollup.** The installed stepstone (0.12.1) has no milestone entities; `group`
  carries the horizon instead. See `../research/2026-10-15-project-start-ritual-design.md` §12.
- **No publishing path.** The file is meant to be sent, not hosted. Client projects are involved;
  hosting is a separate decision.
