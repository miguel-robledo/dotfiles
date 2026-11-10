---
name: security-review
description: Full local security review replacing the unavailable native security_scan. Runs pre-mortem, repository threat modeling, blue-team audits (Semgrep, Trivy, TruffleHog, manual OWASP review), red-team attack-path validation, and remediation verification. Use for security audits, vulnerability assessments, dependency/secret scans, threat models, or when /security is unavailable.
---

# Security Review

This is the local replacement for the OAuth-gated native `security_scan`. It runs in the current session with local tools and does not use `security_scan`. Do not shell out to `omp`, `omp -p`, or `omp review`. Subagents are allowed but optional; they are not a substitute for this workflow.

## Required preparation

- After installing or changing skills, restart or `/new`; verify every `skill://` reference. If a reference fails, read the absolute path under `~/.omp/agent/skills/<name>/SKILL.md` instead.
- Use `thinking-pre-mortem`, `security-threat-model`, `security-and-hardening`, and `thinking-red-team` analytically. Ignore their separate file-output or "pause for a second round" instructions: this workflow gathers scope once and writes no repo files unless asked.
- Supporting skill references were repaired against the upstream layout; if a link is still missing, fall back to the Phase 3 checklist and record the gap.
- Create a private artifact directory and never put raw scanner JSON in chat:

```bash
umask 077
OUT=$(mktemp -d /tmp/security-review-XXXXXX)
```

Raw scanner files contain matched source, secret material, or metadata. Only redacted summaries belong in model context or the final report.

## Modes

| Mode | Use | Includes |
|---|---|---|
| `quick` | PR or small change | Changed files plus working-tree secrets; one combined Semgrep run; targeted Trivy; no full history. Not a CI gate. |
| `standard` | Default service/release review | Full threat model, manual review, full-tree scanners, full history secrets, red-team code paths. |
| `deep` | Pre-production/critical | Standard plus authorized dynamic testing. Unavailable unless Strix or a DAST tool is installed and authorized. |

## Authorization and safety

- Red-team or dynamic testing requires explicit authorization, defined scope, target ownership, and a stop/deconfliction contact. Missing authorization stops **active testing only**; continue the blue-team review.
- Never test production, shared infrastructure, or third-party systems without written permission.
- No denial-of-service, destructive payloads, persistence, lateral movement, or credential exfiltration.
- Do not validate live secrets. If a secret is found, report file:line and detector; tell the user to rotate. Never print the value.
- Stop immediately on unexpected impact and report it.

## Phase 0 — Scope

Record:

- repo/path or target URL, commit/branch, and review mode;
- included paths and exclusions (`vendor`, `node_modules`, generated code, fixtures);
- deployment model, internet exposure, auth model, data sensitivity;
- scanner availability/versions; whether dynamic testing is authorized.

Translate scope into scanner inputs, not just prose:

```bash
TARGETS=(.)                         # quick mode: changed files instead
SEMGREP_EXCLUDES=(--exclude vendor --exclude node_modules --exclude .git)
TRIVY_SKIPS=(--skip-dirs vendor --skip-dirs node_modules --skip-dirs .git)
```

For quick mode, build `TARGETS` from `git diff --name-only --cached`, `git diff --name-only`, and untracked files. Record exclusions a scanner cannot honor.

## Phase 1 — Pre-mortem

Read `skill://thinking-pre-mortem` (fallback path if needed). Assume the feature or the review failed after release. Identify the top 3–5 concrete security failure paths, the conditions that enabled them, and invert each into a control, test, or gate. Do not emit generic risks; a pre-mortem with no plan/test change is incomplete.

## Phase 2 — Threat model

Read `skill://security-threat-model` analytically. Produce a concise, repository-grounded model:

- components, data stores, external integrations, runtime entry points;
- trust boundaries and what crosses them;
- assets: credentials, PII, payments, admin actions, integrity-critical state;
- attacker capabilities and explicit non-capabilities;
- abuse paths mapped to assets and boundaries;
- existing controls with evidence, missing controls, and 1–3 context questions.

If questions remain unanswered, state assumptions and continue with the blue-team review. Do not write a threat-model file unless the user asks.

## Phase 3 — Blue-team audit

Read `skill://security-and-hardening` for extra detail, but use this checklist as the authoritative scope.

### Semgrep — SAST

Local execution is not automatically offline: Semgrep registry configs and the Trivy database may download on first use, and Strix with an Ollama-cloud model is not local-only.

Use the CLI for whole-repository scans. The MCP `semgrep_scan` tool only accepts absolute file paths and uses its own default config; `security_check` does not exist. Use MCP only for targeted files. MCP tracing is disabled in `mcp.json` via `SEMGREP_MCP_DISABLE_TRACING=true`; do not set `SEMGREP_SEND_METRICS=off` on the MCP server because it makes the default auto scan fail.

```bash
semgrep scan \
  --config=p/security-audit \
  --config=p/owasp-top-ten \
  --config=p/secrets \
  --metrics=off --strict \
  --json --output "$OUT/semgrep.json" \
  "${SEMGREP_EXCLUDES[@]}" "${TARGETS[@]}"
```

Do not combine `--config=auto` with `--metrics=off`; auto requires metrics.

Redacted review summary:

```bash
jq -r '.results[] | [.check_id,.path,.start.line,.end.line,.extra.severity,.extra.message] | @tsv' \
  "$OUT/semgrep.json" > "$OUT/semgrep.tsv"
```

Do not print `extra.lines` or the raw JSON.

### Trivy — dependencies, IaC, containers, secrets

```bash
trivy fs \
  --scanners vuln,misconfig,secret \
  --disable-telemetry --skip-version-check \
  --exit-code 0 \
  --format json --output "$OUT/trivy.json" \
  "${TRIVY_SKIPS[@]}" "${TARGETS[@]}"
```

First run downloads the vulnerability/check database. If the cache is absent or the download fails, record degraded coverage rather than calling the scan clean.

Image scan:

```bash
trivy image \
  --scanners vuln,misconfig,secret \
  --image-config-scanners misconfig,secret \
  --disable-telemetry --skip-version-check \
  --format json --output "$OUT/trivy-image.json" <image>
```

Extract only package/rule IDs, severity, target, and fixed version; do not print raw secret matches.

### TruffleHog — secrets

No verification by default. Both scans write raw JSON to the private artifact directory; never read it into chat.

```bash
trufflehog filesystem "${TARGETS[@]}" \
  --json --no-verification --no-update --fail-on-scan-errors \
  > "$OUT/trufflehog-fs.json" 2> "$OUT/trufflehog-fs.err"

REPO=$(git rev-parse --show-toplevel)
trufflehog git "file://$REPO" \
  --json --no-verification --no-update --fail-on-scan-errors \
  > "$OUT/trufflehog-git.json" 2> "$OUT/trufflehog-git.err"
```

Redact before review:

```bash
jq -c 'del(.Raw,.RawV2,.Redacted,.ExtraData,.StructuredData)' \
  "$OUT/trufflehog-fs.json" > "$OUT/trufflehog-fs-redacted.json"
jq -c 'del(.Raw,.RawV2,.Redacted,.ExtraData,.StructuredData)' \
  "$OUT/trufflehog-git.json" > "$OUT/trufflehog-git-redacted.json"
```

Credential verification is a separate, explicitly authorized phase. Do not use `--only-verified` by default; it both makes outbound authentication attempts and hides unverified historical secrets.

### Manual review

Check with file/line evidence:

- authentication, session handling, CSRF, password reset, MFA bypass;
- authorization and IDOR on every object identifier, including multi-tenant paths;
- input validation and output encoding; SQL/NoSQL/command/template injection;
- SSRF, open redirects, path traversal, unsafe file upload/download;
- deserialization, XML/XXE, archive extraction, zip-slip;
- crypto, key handling, randomness, token lifetime, secret storage;
- security headers, CORS, cookies, TLS assumptions;
- rate limits, resource limits, abuse controls;
- audit logging and sensitive-data redaction;
- dependency and supply-chain risk, install scripts, lockfiles;
- IaC/container configuration and least privilege;
- privacy/PII retention and deletion.

Scanner findings are leads. Verify each against the code.

### PHP/Moodle conditional checks

When the repo contains PHP or Moodle, add:

- `require_login`/`require_course_login` with the correct course/module;
- context-correct `has_capability`/`require_capability` and group access;
- POST + `confirm_sesskey` for state changes;
- `required_param`/`optional_param` with appropriate `PARAM_...` types instead of raw superglobals;
- `$DB` placeholders and correct output formatting/escaping;
- external API parameter definitions, context/capability checks, file serving, and privacy/event behavior;
- Moodle DML transaction API (`start_delegated_transaction`, `allow_commit`, `rollback`), not ad-hoc SQL transactions.

## Phase 4 — Red-team validation

Read `skill://thinking-red-team`. For each high-risk area, attempt a concrete attack path in code or an authorized local/staging environment:

- auth bypass, privilege escalation, IDOR, tenant escape;
- injection to data access or command execution;
- SSRF to internal metadata/services;
- file upload to traversal/execution;
- secret exposure to credential use;
- business-logic abuse and race conditions.

A finding needs a reproducible path and impact. Scanner-only patterns are not red-team findings. Record failed attempts as coverage.

### Optional dynamic testing with Strix

Only if Strix is installed, Docker is available, and the target is authorized. Never point it at the live working tree; use a copy or worktree.

```bash
# Example; adjust model and paths.
export STRIX_LLM="ollama/kimi-k3.1-pro:cloud"
export LLM_API_BASE="http://localhost:11434"
export LLM_API_KEY="ollama"
export STRIX_API_TYPE="chat_completions"
export STRIX_TELEMETRY=0

strix \
  --target ./security-copy \
  --scan-mode quick \
  --max-turns 100 \
  --max-budget 5 \
  -n
```

Strix is active exploitation: it needs Docker, may edit the mounted target, and local/Ollama tool-calling is less reliable than frontier models. `--max-turns` is per agent, not a total cap. The installed Docker is a Podman shim; compatibility is unverified. If Strix is unavailable, deep mode is unavailable; report that gap instead of claiming deep coverage.

## Phase 5 — Triage and report

1. Deduplicate findings across scanners and manual/red-team work.
2. Classify each as `confirmed`, `likely`, or `suspected`.
3. Assign severity: `critical`, `high`, `medium`, `low`, `info`.
4. Separate true positives from false positives; say why.
5. Treat scanner errors, parse failures, timeouts, and skipped targets as coverage gaps. No findings plus errors is **not** clean.
6. Verify fixes by rerunning the relevant scanner or exploit path.
7. Record coverage: tools/versions, paths reviewed/excluded, failed attempts, unavailable scanners, first-run DB limitations.

### Output contract

```markdown
# Security Review — <target> @ <commit>

Scope:
Mode:
Authorization:
Tools:

## Pre-mortem — top failure paths

## Threat model — boundaries, assets, abuse paths

## Findings

| ID | Severity | Confidence | Category | Location | Evidence | Impact | Fix | Status |
|----|----------|------------|----------|----------|----------|--------|-----|--------|

## Coverage and exclusions

## Recommended next actions
```

- Keep secrets out of the report; cite file:line and detector only.
- Keep raw scanner JSON in `$OUT`; put only redacted summaries in the report.
- Only write a report into the repo if the user asks.

## Stop conditions

Stop active testing and report instead of continuing when:

- authorization or scope for active testing is missing;
- the target is production or third-party without written permission;
- a test could cause data loss, outage, or persistent access;
- a live secret is found: do not validate it; report and rotate;
- dynamic testing requires unavailable tools or targets.

A missing scanner or unavailable deep/DAST capability is a coverage gap, not a reason to abandon the blue-team review.
