---
description: Scan pi/skills registries for useful packages & skills, propose only (never installs)
---
Scan the two registries and propose candidates. Read-only: install nothing, edit
nothing. This run takes no arguments — ignore anything typed after the command.

1. **Baseline from disk, never from memory.** Read `~/.pi/agent/TOOLS.md` §1
   (skills), §3 (packages), §4 (MCP servers), §5 (agents), and
   `~/.pi/agent/settings.json` → `packages`. Skills already listed in your prompt
   count as installed. Summarize in one line per area what the loadout already
   does. If `TOOLS.md` and disk disagree, disk wins — say so.

2. **Snapshot both front pages, unfiltered.** `fetch_content` on
   `https://pi.dev/packages` and `https://www.skills.sh`. "Front page" means the
   entries rendered on first load: no category filter, no sort change, no search,
   no pagination, no scrolling for more. A readable fetch that returns no
   per-entry names — JS-only, or only group headers such as
   `+3 more from owner/repo (3.6M total)` — counts as a failure: render that page
   once via `mcp:playwright` instead. If that also fails, report the blocker for
   that page and continue with the other. Never invent entries and never
   substitute training data for a failed fetch.

3. **Shortlist, each entry labelled with exactly one class.**
   - **G1 GAP** — does something the loadout cannot do at all, and that matters for
     shipping production-grade software.
   - **G2 BETTER** — does a job the loadout already does, but materially better.
     Must name the incumbent and the concrete improvement.
   - **G3 SPECIALIST** — narrow and high-quality for one domain (a language,
     framework, or discipline). Admissible with no overlap at all.
   Out of scope by definition: generic prompt packs, themes and UI cosmetics,
   aggregator bundles of other skills, and anything whose value is invisible in a
   software workflow.

4. **One verification hop per shortlisted candidate, before it may be proposed.**
   - Skill: its repo page — stars, last commit, license, what the `SKILL.md`
     actually claims.
   - Package: npm/repo page — installs, last publish, license, `pi-package`
     keyword, dependency weight.
   Reject and record the reason for: inactivity ≥12 months, archived or
   unmaintained, no license, claim not verifiable from the page, or a security
   smell (postinstall scripts, unexplained network or credential access).

5. **Propose, then stop.** Ordered by value, at most 5 rows:

   | # | Candidate | Class | Gap / improvement | Evidence | Install |
   |---|---|---|---|---|---|

   `Evidence` is one line with the numbers from step 4. `Install` is the exact
   command: `pi install npm:<pkg>` or `pi install git:github.com/<owner>/<repo>` for
   packages; `bunx skills@latest add <owner>/<repo>@<skill> -g -a pi -y` for skills.

   Then every shortlisted-but-dropped candidate as
   `Rejected: <name> — <one-line reason>`, and one line giving the entry count each
   front page carried, so a thin or empty page is visible rather than silent. An
   empty result is a valid outcome — say so instead of padding the list.

6. **Hard stop.** No install, no `settings.json` edit, no `TOOLS.md` edit. If the
   user approves ("install 2 and 4"), that is separate work in a later turn: run
   the commands, verify with `pi list` and the skills listing, then update
   `TOOLS.md` §1/§3 in that same turn (AGENTS.md maintenance rule).
