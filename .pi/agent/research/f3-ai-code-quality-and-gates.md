# Research: AI-generated code quality ("AI slop") and the gates that detect it

## Summary

The evidence supports three narrow claims, not two broad ones: AI raises output volume and
locally-measured generation speed, while the *structural* properties that make codebases cheap to own
(reuse, consolidation, cross-file integration) decline in every longitudinal dataset that measures
them; AI-authored changes concentrate *different* defects rather than uniformly more; and the cost
surfaces after generation — in review time, churn and stability — which is where an agent-driven
solo workflow has no measurement at all.

## Quality differences with evidence

**Longitudinal structure — vendor-published, large n, correlational.** GitClear's 2025 report
classified every changed line from git history across 211M changed lines (2020–2024, repos including
Google/Microsoft/Meta): refactoring ("moved" lines) fell from 25% of changed lines in 2021 to under
10% in 2024, while copy/pasted lines rose 8.3% → 12.3%; 2024 was the first year within-commit
copy/paste exceeded moved code
([GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research)). The 2026 update
tracks seven signals 2023–2026: duplicated blocks 40.3 → 73.0 per million changed lines (+81%),
moved code 21% (2022) → 3.8% YTD 2026, copy/paste 9.4% → 15.7%, function connectivity −35%, and
"long-term update percent" −74%
([GitClear 2026](https://gitkraken.gitclear.com/the_ai_code_quality_maintainability_gap)). Caveats:
GitClear sells the measurement; 2025 duplication was measured via a copy/paste proxy; no causal
identification. Practitioner critique flags concurrent layoffs as a confounder
([Bowley](https://blog.robbowley.net/2025/02/17/gitclears-latest-report-indicates-genai-is-having-a-negative-impact-on-code-quality)).
No peer-reviewed rebuttal found.

**Task-speed RCTs — strong designs, narrow scope, conflicting results.** GitHub/Microsoft's RCT
(n=95, JavaScript HTTP server) found 55.8% faster completion (71.17 vs 160.89 min, p=0.0017)
([Peng et al.](https://www.microsoft.com/en-us/research/publication/the-impact-of-ai-on-developer-productivity-evidence-from-github-copilot/))
— vendor-sponsored, one greenfield task, self-reported time. Google's enterprise RCT (n=96 engineers,
real internal task) found ~21% faster, wide CI
([Paradis et al.](https://arxiv.org/abs/2410.12944)). Cui et al.'s three field experiments
(Microsoft, Accenture, Fortune 100; 4,867 developers) found +26.08% completed tasks (SE 10.3%),
**no negative effect on build success**, larger gains for less-experienced developers
([Cui et al.](https://www.microsoft.com/en-us/research/publication/the-effects-of-generative-ai-on-high-skilled-work-evidence-from-three-field-experiments-with-software-developers)).
METR's RCT — 16 experienced maintainers, 246 tasks, mature 1M+ LOC repos — found a **19% slowdown**
while developers forecast +24% and post-hoc believed 20% faster
([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)); METR lists what
it does not claim (other domains, task types, future models). Researcher inference: AI compresses
generation and expands integration; which dominates depends on codebase coupling and familiarity.

**Defect profile — peer-reviewed.** Cotroneo et al. (ISSRE 2025; 500k+ samples, Python/Java, 3 LLMs)
found AI code simpler and more repetitive, more prone to unused constructs and hardcoded debugging,
and carrying more high-risk vulnerabilities; human code concentrates maintainability issues
([Cotroneo et al.](https://arxiv.org/abs/2508.21634)).

**Review effort — the strongest slop signal.** A Harvard working paper on Jellyfish's analytics panel
found AI agents produced +30% lines, +20% commits, +23% PRs, but **review time per PR rose 49%**,
changes-requested share nearly doubled, comments/PR +35%, with no significant increase in finished
work ([Ars Technica](https://arstechnica.com/ai/2026/10/ai-coding-agents-generate-more-code-but-not-more-software/),
[paper](https://fion.ac/jellyfish.pdf)) — not peer-reviewed, vendor-owned data. MSR 2026 examined
1,779 rejected PRs (594 AI, 1,185 human): the top AI rejection reason was incomplete implementation
(~32.66% of the 594), and reviewer abandonment was the most common rejection pattern
([ACM](https://dl.acm.org/doi/full/10.1145/3793302.3793568)). MSR 2026's review-effort model over
33,707 agent PRs found 28.3% merge instantly (median 68 changed lines vs 104), with file types +
patch size predicting high-effort PRs at AUC 0.96 (≈0.83 repo-disjoint)
([arXiv](https://arxiv.org/abs/2601.00753)).

**Security and supply chain.** Veracode (vendor; 100+ models, 80 tasks, 4 languages): 45% of samples
introduced an OWASP Top 10 weakness (Java 72%, JS 43%, C# 45%, Python 38%), XSS in 86% of relevant
samples, security performance flat across model generations
([Veracode](https://www.veracode.com/blog/genai-code-security-report/)). Apiiro (vendor, Fortune 50
telemetry) reports 3–4× commit rate with 10× security findings and 2.5× more CVSS ≥7.0 findings
([Apiiro](https://apiiro.com/blog/4x-velocity-10x-vulnerabilities-ai-coding-assistants-are-shipping-more-risks));
methodology unpublished. Peer-reviewed: Perry et al. (CCS 2023) found participants *with* an AI
assistant wrote less secure code yet believed it was more secure
([Perry](https://arxiv.org/html/2211.03622v3)); Pearce et al. found ~40% of 1,689 Copilot completions
vulnerable ([Pearce](https://arxiv.org/abs/2108.09293)). Spracklen et al. (USENIX Security 2025)
generated 576,000 samples from 16 models: ≥5.2% of commercial-model and 21.7% of open-source-model
package references were nonexistent — 205,474 unique hallucinated names
([Spracklen](https://arxiv.org/abs/2406.10279)), re-measured at 4.62–6.10% on five 2026 frontier
models ([replication](https://arxiv.org/abs/2605.17062)). GitGuardian (vendor): 28.65M new hardcoded
secrets in public GitHub commits in 2025 (+34% YoY), AI-service secrets +81% to 1,275,105
([GitGuardian](https://www.gitguardian.com/state-of-secrets-sprawl-report-2026)).

**Delivery level.** DORA 2024 (n≈39,000): a 25% AI-adoption increase is associated with 1.5% *lower*
throughput and 7.2% *lower* stability, while co-occurring with +3.4% code quality, +3.1% review speed
and −1.8% code complexity ([DORA 2024](https://dora.dev/research/2024/dora-report/)). DORA 2025
(~5,000 respondents, 100+ hours qualitative): 90% adoption, 80%+ self-reported productivity gains,
~30% little or no trust in AI code, a *positive* throughput/product relationship, a persistent
*negative* stability relationship; gains concentrate in loosely coupled architectures with fast
feedback — AI amplifies existing strengths and weaknesses
([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)).

## Measurable gates

| Signal | What it detects | Correlation evidence | How to measure |
|---|---|---|---|
| Mutation score | Tests asserting behaviour vs merely executing lines | Mutant detection correlates with real-fault detection **independent of coverage** ([Just et al., FSE 2014](https://homes.cs.washington.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf)); mutation coverage alone is not strongly correlated with real faults ([AlBlwi 2024](https://ieeexplore.ieee.org/iel8/10555578/10556387/10556415.pdf)) | Stryker/PIT/mutmut on changed files only |
| Assertions per test | Coverage theatre — tests with no assertion | Assertion quantity and assertion coverage strongly correlate with effectiveness; coverage's correlation collapses once assertions are controlled ([Zhang & Mesbah, FSE 2015](https://people.ece.ubc.ca/amesbah/resources/papers/fse15.pdf)) | AST count of assertion calls ÷ test count |
| Line coverage | Untested paths (necessary, not sufficient) | Low-to-moderate correlation once suite size is controlled; suite size correlates more ([Inozemtseva & Holmes, ICSE 2014](https://blog.acolyer.org/2014/10/21/coverage-is-not-strongly-correlated-with-test-suite-effectiveness/)) | Gate on new-code delta, never repo total |
| Duplication % | Copy-paste propagation tax — AI's worst-degraded metric | One of seven GitClear signals eroding as AI authorship scales; Sonar's default gate is ≤3% on new code | jscpd / PMD CPD / Sonar on the diff |
| 30-day churn / turnover | Code written then rewritten within weeks | Relative code churn predicts system defect density ([Nagappan & Ball, ICSE 2005](https://www.microsoft.com/en-us/research/publication/use-of-relative-code-churn-measures-to-predict-system-defect-density/)) | Lines changed <30 days after writing ÷ lines changed, per file |
| Change failure rate + MTTR | Shipped changes breaking production, and recovery speed | Core DORA metric set; stability is what AI adoption damages most | CI/CD + incident ledger |
| Static analysis / type errors | Insecure defaults, error masking, dead constructs | Google's Error Prone: checks work only when effective and low-false-positive ([Sadowski et al., CACM 2018](https://cacm.acm.org/research/lessons-from-building-static-analysis-tools-at-google)) | tsc --noEmit, Semgrep/Error Prone in CI; gate zero *new* findings |
| Dependency audit + existence check | Slopsquatting, typosquats, unaudited adds | 4.6–21.7% of LLM package references do not exist and attackers register such names | pip-audit/npm audit **plus** an explicit "does this package exist and match intent" step |
| Secrets scan | Hardcoded credentials, AI-suggested placeholder keys | 28.65M secrets leaked to public GitHub in 2025 | gitleaks/trufflehog pre-commit and CI |
| CI green / reproducible build | Non-compiling or environment-specific output | Weak discriminator: Cui et al. found no build-success penalty from Copilot | Required CI check |
| Review metrics: changes-requested %, comments/PR, review time, PR size | The bottleneck where slop actually surfaces | +49% review time, ~2× changes-requested, +35% comments/PR after agent adoption; large patches predict high-effort PRs (AUC ≈0.83 repo-disjoint) | Git host API; alarm on PR size and changes-requested rate |

## A defensible definition of done

Synthesised from Google's public practice, the most explicit first-party bar available:

1. **The change improves overall code health.** Google's senior review principle is not perfection
   but "definitely improves the overall code health of the system"
   ([Google eng-practices](https://google.github.io/eng-practices/review/reviewer/standard.html)).
2. **Design**: belongs in this codebase, integrates with the system, no speculative generality
   ([what to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html)).
3. **Tests that fail when the code breaks** — Google's literal question — shipped in the same change,
   with a human validating that the tests are meaningful.
4. **No more complexity than the problem needs**, at line, function and class level.
5. **Documentation updated** when build/test/interaction/release behaviour changes.
6. **Every line understood by the reviewer.** If it cannot be understood, it gets simplified — the
   single strongest anti-slop rule.
7. **Operational readiness** for service-shaped work: SLOs, monitoring, rollback, capacity,
   dependencies ([Google SRE PRR](https://sre.google/sre-book/evolving-sre-engagement-model/)).
8. **Post-merge gates**: 30-day churn, change failure rate, MTTR — because DORA 2025 shows AI's damage
   lands on stability, not on code aesthetics.

## What the sceptics may be getting wrong

- Reading GitClear as causal: it is a time series with simultaneous layoffs, tool migration and
  remote shifts, published by a vendor selling the metric.
- Reading METR as "AI slows developers" universally: its own scope list excludes other domains, task
  types and future models; it measured maintainers on repos they already knew.
- Using coverage as the anti-slop gate: it is the most gameable and least correlated test metric.
- Assuming AI-authored PR acceptance is a clean quality signal — see contradictions below.
- Forgetting that vendor-published RCTs and vendor-published risk reports are *both* sponsored.

**Contradictions.** (a) AI PR acceptance: 28.3% instant merges
([MSR 2026](https://arxiv.org/abs/2601.00753)), ~84% accepted/merged in some AIDev-based analyses
(vendor/practitioner summaries), and materially higher rejection for AI-authored PRs
([ACM](https://dl.acm.org/doi/full/10.1145/3793302.3793568)) — dataset and definition dependent.
(b) Speed: +55.8%, +26%, +21% versus −19%. (c) Vulnerability rates: 45%/40% of generated samples
versus an absence of build or reliability penalties in field experiments.

## Numbers worth quoting

- Review time per PR **+49%**, changes-requested ~**2×**, comments/PR **+35%**, code **+30%**, finished
  work not significantly higher — Chen & Stratton, Harvard working paper on Jellyfish data, 2026.
- **19% slower**, believed **20% faster** — METR RCT, 2025 (pre-print).
- **+26.08%** completed tasks over 4,867 developers, no build penalty — Cui et al. field RCTs
  (*Management Science*).
- **45%** of AI samples introduced an OWASP Top 10 weakness (Java 72%) — Veracode 2025 (vendor).
- **4.62–6.10%** of 2026 frontier-model package references nonexistent; **5.2–21.7%** in the 2025
  USENIX original.
- **7.2%** stability decrease per 25% AI-adoption increase — DORA 2024.
- Duplicated blocks **+81%** (2023→2026); refactored "moved" code **3.8%** of changed lines — GitClear
  2026 (vendor).

## Uncertainty / could not verify

- No peer-reviewed audit of GitClear's Diff Delta classification; the 2025 whitepaper's duplication
  methodology was not retrievable in full.
- Apiiro's 10×/3–4× figures are a vendor blog with unpublished methodology; the page returned HTTP
  403 and I relied on secondary citations. Directional only.
- Veracode measures model output on fixed prompts, not production code; not a shipped-software
  defect rate.
- The Jellyfish/Harvard 49% is a single working paper on a vendor panel; directionally consistent
  with MSR 2026, magnitude unreplicated.
- DORA 2025's stability finding is stated qualitatively in the release blog; the coefficient is in a
  gated PDF I could not fetch.
- `source_check` on the DORA 2024 coefficient returned automated status "unclear" (semantic
  entailment unavailable). I verified it manually against a passage quoted from the DORA 2024 PDF in
  the same call: "-7.2% -1.5% … an estimated 1.5% reduction for every 25% increase in AI adoption".
- I could not verify the 2026 GitClear figures independently of GitClear.

## Sources

Kept: GitClear 2025/2026; METR RCT; Cui et al. + Google enterprise RCT; DORA 2024/2025; Cotroneo et
al. (ISSRE 2025); Spracklen et al. (USENIX Sec 2025) + 2026 replication; Perry et al. (CCS 2023) and
Pearce et al.; Just et al. (FSE 2014), Inozemtseva & Holmes (ICSE 2014), Zhang & Mesbah (FSE 2015);
Nagappan & Ball (ICSE 2005); Google eng-practices + Google SRE PRR + Sadowski et al. (CACM 2018);
MSR 2026 review-effort and rejection studies; Chen & Stratton working paper.

Rejected/deprioritised: CodeRabbit "1.7× more issues" (vendor, no methodology); GitHub's Copilot
code-quality study (self-reported perception only); SEO aggregators (specifys.ai, byteiota,
vibegraveyard, lotusaiplatform) used for discovery only.
