# Production-grade workflows vs this setup — deep research and gap analysis

Date: 2026-10-15. Subject: the `~/.pi/agent` agent workflow and the `coloso-v2` /
`qa-coloso` / `picker` projects it drives.

## 1. Scope and method

Three independent research facets were dispatched in parallel, each required to cite
primary sources and to state what it could not verify:

- **F1** — team and release-engineering practices with measured impact.
- **F2** — agentic coding workflows as practised by teams that ship.
- **F3** — empirical evidence on AI-generated code quality and the gates that detect it.

The "mine" side was rebuilt from disk, not memory: `~/.pi/agent/AGENTS.md`,
`TOOLS.md`, `WATCHDOG.md`, `prompts/kickoff.md`, `settings.json`,
`coloso-v2/.gitlab-ci.yml`, `coloso-v2/AGENTS.md`, `coloso-v2/docs/deploy/*`,
`coloso-v2/openspec/specs/*` (48 capabilities), the change history, and the
subagent dispatch census.

Claims marked **[verified]** were re-fetched and read verbatim during synthesis —
that pass caught one bad citation (F2's "convert it to a hook" quote does not exist
on the Anthropic context-engineering page) and confirmed Google's review bar
word-for-word.

## 2. What the evidence says production-grade means

Ordered by strength of evidence, not by popularity.

| # | Practice | Measured effect | Confidence |
|---|---|---|---|
| 1 | **Small changes, one reviewer, fast review** | Google: median change **24 lines**, **1 reviewer**, **<4 h** latency, 2.6 h/week reviewing. Microsoft: only **14%** of review comments are defects (4th most common category). McIntosh: lax review participation ⇒ up to **5 extra post-release defects** | High (descriptive) |
| 2 | **Trunk-based / small batches** | DORA 2022 SEM: lift to org performance **36% → 1525%** depending on documentation quality | Medium-high (association) |
| 3 | **CI, CD, deployment automation** | CD improves delivery performance and availability, reduces rework/burnout; elite reliability teams **3× more likely** to be loosely coupled | Medium-high |
| 4 | **Automated pass/fail check in the loop** | Claude Code: *"Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop."* **[verified]**. Rungs: in-prompt check → `/goal` → **Stop hook that blocks the turn ending** → independent verification subagent | High (first-party practice) |
| 5 | **Independent, fresh-context review** | Devin Review: **~2 bugs/PR, 58% severe**. Counter-trap: *"A reviewer prompted to find gaps will usually report some, even when the work is sound… chasing every finding leads to over-engineering"* | Medium |
| 6 | **Deterministic controls over advisory text** | *"Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens"*; sandboxing cut permission prompts **84%** internally | High (first-party) |
| 7 | **Shift-left security + supply chain** | DORA: high performers spend **50% less time** remediating security issues. 45% of AI-generated samples carried an OWASP Top 10 weakness | Medium (vendor/sponsored) |
| 8 | **Documentation quality** | DORA 2023: generative culture ↔ **30%** higher org performance; docs "drastically increase" capability effectiveness | Medium-high (self-report) |
| 9 | **Mutation testing as a *diagnostic*** | Mutants coupled to **73%** of real faults; mutant detection correlates with real-fault detection *independent of coverage* (Â12 0.66–0.81). **But** with suite size controlled the correlation drops to **0.05–0.20** | High / contested |
| 10 | **Peer review instead of approval boards** | DORA: external change-approval boards correlate with **worse** delivery performance; "adding more process … will make things worse" | High (stated finding) |

**Practices that are folklore.** Stated as practice by credible first parties, but with
**no located measured impact**: design docs / RFCs / ADRs, SLOs and error budgets,
blameless postmortems, progressive delivery (canary/blue-green/flags), the test
pyramid vs trophy, and "definition of done" artifacts specifically. The widely-repeated
"postmortems give 20–35% fewer repeat incidents" traces only to vendor marketing — do
not quote it.

**The AI-specific evidence is the most relevant and the most contested:**

- DORA 2024, per **+25% AI adoption**: +7.5% docs quality, +3.4% code quality, +3.1%
  review speed — but **−1.5% throughput and −7.2% stability**. DORA 2025 (~5,000
  respondents): AI is *"an amplifier"*; throughput correlation turned positive,
  **stability stayed negative**; gains require loosely coupled architecture, fast
  feedback and "strong automated testing".
- RCTs conflict: GitHub/Microsoft **+55.8%** (n=95, greenfield), Google **+21%**,
  Cui et al. **+26%** over 4,867 developers with no build-success penalty — versus
  METR **−19%** (16 experienced maintainers, 246 tasks on repos they knew).
- Structural drift, vendor-measured and correlational (GitClear, 211M changed lines):
  refactored "moved" lines **25% → <10%**; copy/paste **8.3% → 12.3%**; duplicated
  blocks **+81%** by 2026; function connectivity **−35%**.
- The strongest "slop" signal is not in the code, it is in the process around it:
  Jellyfish/Harvard — AI agents produced **+30% lines, +23% PRs** but **review time per
  PR +49%**, changes-requested **~2×**, comments **+35%**, with **no significant
  increase in finished work**.
- Supply chain: **≥5.2%** of commercial-model and **21.7%** of open-source-model package
  references do not exist (re-measured at 4.62–6.10% on 2026 frontier models);
  attackers register those names.

## 3. This setup, as verified on disk

**Present and matching the evidence:**

- `.gitlab-ci.yml` with staged jobs — `secret_detection` · `executor:verify` ·
  `web:verify` → `executor:integration` → supply chain (`cargo-audit`, `cargo-deny`,
  `sbom`) → build → `deploy:staging` / `deploy:prod`.
- Merge blocked on a green pipeline; protected branches and tags; maintainer merge.
- Trunk-based on `master`, short-lived `feat/`·`fix/`·`chore/` branches, MR +
  squash-merge.
- Prod on manual `vMAJOR.MINOR.PATCH` tags; a **deploy + rollback runbook**
  (rollback = redeploy previous tag); a post-deploy self-check; known risks recorded
  (local-only backups).
- 48 capability specs; each change carries `proposal.md` + `design.md` + `tasks.md` +
  spec deltas, archived with deltas merged forward; project-local OpenSpec skills.
- The `ai-validation` capability requires a committed findings register where **every
  finding carries FIX / DEFER-with-trigger / NOTE**, raw lens reports committed
  verbatim, and external-currency claims anchored to primary sources.
- Security pre-mortem reports, per-defect IDs, QA findings filed as GitLab issues.
- Independent adversarial review as the default action: `engineering-code-reviewer`
  is **61%** of all recorded dispatches.
- Ponytail/YAGNI discipline as a first-class rule — which is Google's *"reviewers
  should be especially vigilant about over-engineering"* **[verified]** criterion.
- Review loops capped at ~3 rounds — which is exactly the countermeasure for the
  "reviewer manufactures findings" trap.

**The one thing the census shows clearly:** delegation is concentrated in *verification*
(61%) and almost absent from *recon* and *contract-first parallel work*, and the
"only the specified cases get used" effect is real — it was caused by visibility
(2 of 93 agents reachable without a lookup) and by a closed 7-role rotation.

## 4. Gap analysis

Ranked by (impact × evidence strength) ÷ cost.

| # | Gap | Evidence | Severity | Remedy | Cost |
|---|---|---|---|---|---|
| **G1** | **No runnable check that gates completion.** "Done" is asserted, and the Rule 3 watchdog is a *reminder* — the weakest rung of the ladder. pi can express a stronger one: `tool_call` returns `{block:true}` and **`turn_end` is an actionable boundary that can force another model request** (`continue: true`, guard the condition). | Claude Code rung ladder **[verified]**; OpenAI: ≥**59.4%** of audited SWE-bench Verified failures have *flawed tests that reject correct patches*; METR reward-hacking transcripts; the previous session's own "narrated-unperformed checks" failure mode | **High** | Small pi extension: on `turn_end`, if the turn claimed a verification, check the evidence exists; force continuation when it does not | Medium (one extension) |
| **G2** | **No post-merge quality telemetry.** Nothing measures 30-day churn, change-failure rate, MTTR, rework, or cost per task. This is the exact damage DORA 2025 attributes to AI (stability) and the exact cost Jellyfish measured (+49% review time, no more finished work). | Nagappan & Ball: relative churn predicts defect density; DORA 2024 **−7.2% stability**; Jellyfish/Harvard; GitClear churn signals | **High** | Three derivable numbers: 30-day churn from git, change-failure rate from deploy tags + the existing defect ledger, review-effort per MR from GitLab | Low (script + a habit) |
| **G3** | **Test quality has no signal beyond coverage** — the most gameable, least-correlated metric. No mutation testing anywhere. | Inozemtseva & Holmes: "high coverage does not indicate that a test suite is effective"; Zhang & Mesbah: assertions count, coverage does not; Just et al.: mutants couple to 73% of real faults — *but* Papadakis: 0.05–0.20 after size control | Medium-high | Mutation testing on **changed files only**, as a diagnostic on risky paths — not a repo-wide gate | Medium |
| **G4** | **Planning is unconditional.** `/kickoff` mandates plan mode and OpenSpec for every task, including one-file fixes (the change history contains many: `dropdown-rename-policy`, `form-nested-field-error`, `data-table-row-click-guard`). | Claude Code: *"Plan mode … also adds overhead. For tasks where the scope is clear and the fix is small … ask Claude to do it directly"* **[verified]**; Fowler/Böckeler, hands-on with Kiro and Spec Kit: a small bug became **4 user stories / 16 acceptance criteria**, and Spec Kit produced **8 markdown files for a 3–5 point story** — *"false sense of control"*, and the agent did not follow the instructions anyway | Medium | A size gate in the kickoff template and Rule 3: if the diff is describable in one sentence and touches one file, skip plan mode and the change proposal | Low |
| **G5** | **No dependency-existence check.** `cargo-audit`/`cargo-deny`/`npm audit` catch *known* CVEs; nothing catches a package that does not exist. | Spracklen et al. (USENIX 2025): **≥5.2%** commercial / **21.7%** open-source model package references are nonexistent; 2026 replication 4.62–6.10%; attackers register hallucinated names | Medium | One line in Rule 1 class 2, plus a "verify it exists and matches intent" step before any dependency add | Very low |
| **G6** | **No definition of done / production-readiness bar.** A post-deploy self-check exists; a pre-merge bar does not. | Google's review standard **[verified]** (*"definitely improves the overall code health"*), the five axes, **Every Line**, *"Will the tests actually fail when the code is broken?"* — plus Google's production-readiness review. **Caveat: no measured impact for DoD artifacts as such** | Medium | Write a short DoD from the Google criteria; treat it as advisory, not as a measured improvement | Low |
| **G7** | **Always-on context is heavy**: 31.7 KB `AGENTS.md` (~7.9k tokens/turn) plus a 5.2k-token skill catalog. | Anthropic context engineering: context is a *"finite resource with diminishing marginal returns"*, an **"attention budget"**; the goal is *"the smallest possible set of high-signal tokens"*; the same page warns against bloated **tool** sets with ambiguous decision points **[verified]**. The specific "bloated CLAUDE.md ⇒ rules get lost" quote is **unverified** — treat the mechanism as inferred, not measured | Low-medium | Move the task-pattern table and remaining prose into `TOOLS.md`; keep only rules + triggers inline | Low |

## 5. What is already at or above the bar — do not change

Trunk-based development and small changes; CI as an enforced gate; deployment
automation with a written rollback path; the OpenSpec archive that merges deltas into
living capability specs (this is what DORA's documentation-quality multiplier rewards);
adversarial review as the default action; ponytail/anti-over-engineering as a rule;
the ~3-round review cap; security pre-mortems and supply-chain scanning; the
dispositioned findings register with verbatim evidence; per-defect IDs; the deliberate
"no worktrees for agent-executed work" trade-off.

Note on G1's sibling: DORA's finding that *external approval boards hurt* and that
*"adding more process will make things worse"* is an argument against adding gates here
generally. That is why every remedy above is either a **measurement** (G2, G3, G5) or a
**deterministic check on existing work** (G1, G4) — not another review stage.

## 6. Ranked recommendations

1. **Instrument the three missing numbers** (G2) — 30-day churn, change-failure rate,
   MTTR. Until this exists, the AI-stability damage DORA describes is invisible here.
2. **Add a deterministic completion check** (G1) — the `turn_end` extension. Highest
   leverage on the failure mode this setup has already been bitten by.
3. **Gate process by change size** (G4) — one-sentence, one-file changes skip plan mode
   and the proposal; the evidence says the overhead is not free.
4. **Mutation testing on changed files** (G3), starting on the security- and
   money-adjacent paths.
5. **Dependency-existence step** (G5) — near-zero cost.
6. **Write the DoD** (G6) and **trim the context file** (G7) — both cheap, both weakly
   evidenced, so do them last and label them as hygiene.

## 7. Honest limits of this analysis

- **Almost every strong number predates 2023** (Google 2018, Microsoft 2013, McIntosh
  2014, mutation 2014/2018). Post-2023 quantitative evidence is limited to DORA
  2024/2025 (self-report surveys), two small AI RCTs, and vendor research.
- **DORA is correlational**, and the authors frame their findings as hypotheses to
  replicate locally. The 2024 full report PDF was not retrievable; figures come from
  first-party summaries.
- **Vendor-funded data is directional only**: GitClear (sells the metric), Veracode
  (SAST-only measurement, criticised as a flawed instrument), Jellyfish/Harvard (one
  working paper, unreplicated magnitude), Apiiro (unpublished methodology, 403).
- **The AI speed question is unresolved**: +55.8% / +26% / +21% versus −19%.
- **Practices recommended by everyone and measured by no one** — design docs, ADRs,
  SLOs, postmortems, progressive delivery, the test pyramid — are flagged as folklore
  above, and this setup already has most of them.
- **Nothing in this analysis was experimentally validated on this setup.** No A/B, no
  local measurement; the gap ranking is a judgement over external evidence.

## 8. Sources

Anthropic: multi-agent research system · effective context engineering · Claude Code
best practices · sandboxing · patterns and problems in multiagent systems.
Cognition: *Don't Build Multi-Agents* · *Multi-Agents Working*. GitHub: Spec Kit ·
spec-driven development blog · Copilot code-review cost. Amazon Kiro specs docs.
Böckeler/Fowler on SDD tools. DORA: capabilities (trunk-based, continuous delivery,
loose coupling, documentation quality, pervasive security, streamlining change
approval), 2023/2024/2025 reports. Google: eng-practices reviewer standard and
looking-for · SRE workbook (canarying, postmortems, SLOs, PRR) · Sadowski et al.
(ICSE-SEIP 2018). Bacchelli & Bird (ICSE 2013). McIntosh et al. (MSR 2014).
Inozemtseva & Holmes (ICSE 2014, Distinguished Paper). Zhang & Mesbah (FSE 2015).
Just et al. (FSE 2014). Papadakis et al. (2018). Nagappan & Ball (ICSE 2005).
Cotroneo et al. (ISSRE 2025). Perry et al. (CCS 2023). Pearce et al. Spracklen et al.
(USENIX Security 2025 + 2026 replication). Peng et al. (Copilot RCT). Paradis et al.
(Google RCT). Cui et al. (field experiments). METR: RCT, reward hacking, Feb-2026
uplift update. OpenAI: retiring SWE-bench Verified. GitClear 2025/2026. Veracode
GenAI security reports. GitGuardian secrets sprawl 2026. MSR 2026 agent-PR review
effort; MSR 2026 rejected-PR analysis. Chen & Stratton / Jellyfish (Harvard working
paper). arXiv 2606.22721 (reviewer habituation).
