---
name: security-review
description: Full local security review replacing the unavailable native security_scan. Runs pre-mortem, repository threat modeling, blue-team audits (Semgrep, Trivy, TruffleHog, manual OWASP review), red-team attack-path validation, and remediation verification. Use for security audits, vulnerability assessments, dependency/secret scans, threat models, or when /security is unavailable.
---

# Security Review

This is the local replacement for the unavailable `security_scan`. Run it in the current session with the local tools. Do not shell out to `omp`, `omp -p`, or `omp review`. Subagents are allowed but optional; they are not a substitute for this workflow.

## Modes

| Mode | Use | Includes |
|---|---|---|
| `quick` | PR, small change, pre-commit | Pre-mortem lite, Semgrep, Trivy, TruffleHog, manual review of changed code. No dynamic testing. |
| `standard` | Default for a service or release | Full threat model, manual OWASP review, all scanners, red-team code-path validation. |
| `deep` | Pre-production, auth/payments/PII, critical release | Standard plus authorized dynamic testing (Strix/DAST), exploit validation, remediation retest. |

## Authorization and safety

- Red-team or dynamic testing requires explicit authorization, defined scope, target ownership, and a stop/deconfliction contact. If missing, do **blue-team only**.
- Never test production, shared infrastructure, or third-party systems without written permission.
- No denial-of-service, destructive payloads, persistence, lateral movement, or credential exfiltration.
- Stop immediately on unexpected impact and report it.
- Never print secret values. Cite file:line and detector only; tell the user to rotate.

## Phase 0 — Scope

Record:

- repo/path or target URL, commit/branch, and review mode;
- in-scope and excluded paths (`vendor`, `node_modules`, generated code, fixtures);
- deployment model, internet exposure, auth model, data sensitivity;
- scanner availability and versions;
- whether dynamic testing is authorized.

If the scope is ambiguous, ask 1–3 questions before scanning.

## Phase 1 — Pre-mortem

Read `skill://thinking-pre-mortem` for `standard`/`deep`; for `quick`, use the compact check below.

Assume the feature or the review itself failed after release. Generate concrete security failure paths:

- what was missed (authz, tenant isolation, secret handling, dependency, deployment);
- what had to be true for the failure;
- invert each condition into a control, test, or gate;
- bind the top 3–5 risks to verification checkpoints.

Do not emit generic risks. A pre-mortem with no plan/test change is incomplete.

## Phase 2 — Threat model

Read `skill://security-threat-model` for `standard`/`deep`. Produce a concise, repository-grounded model:

- components, data stores, external integrations, runtime entry points;
- trust boundaries and what crosses them;
- assets: credentials, PII, payments, admin actions, integrity-critical state;
- attacker capabilities and explicit non-capabilities;
- abuse paths mapped to assets and boundaries;
- existing controls with evidence, and missing controls;
- 1–3 questions for context that changes severity.

Anchor every claim to repo evidence. Do not invent architecture.

## Phase 3 — Blue-team audit

Read `skill://security-and-hardening` for the detailed checklist.

### Static and dependency scanners

Use Semgrep MCP tools when available (`semgrep_scan`, `security_check`); otherwise run the CLI.

```bash
# SAST
semgrep scan --config=p/security-audit --metrics=off --json .
# Focused rules
semgrep scan --config=p/owasp-top-ten --metrics=off --json .
semgrep scan --config=p/secrets --metrics=off --json .
```

Do not combine `--config=auto` with `--metrics=off`; auto requires metrics.

```bash
# Dependencies, IaC, containers, secrets
trivy fs --scanners vuln,misconfig,secret --format json --output /tmp/security-review-trivy.json .
trivy image <image>
```

```bash
# Secrets: offline working tree
trufflehog filesystem . --json --no-verification
# Secrets: git history with verification (network calls)
trufflehog git file://. --json --only-verified
```

Also run the ecosystem audit when applicable: `composer audit`, `npm audit`, `pip-audit`, `cargo audit`.

### Manual review

Check, with file/line evidence:

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

Scanner findings are leads, not conclusions. Verify each against the code.

## Phase 4 — Red-team validation

Read `skill://thinking-red-team` for `standard`/`deep`.

For each high-risk area, attempt a concrete attack path in code or an authorized local/staging environment:

- auth bypass, privilege escalation, IDOR, tenant escape;
- injection to data access or command execution;
- SSRF to internal metadata/services;
- file upload to traversal/execution;
- secret exposure to credential use;
- business-logic abuse and race conditions.

A finding needs a reproducible path and impact. Scanner-only patterns are not red-team findings. Record failed attempts too; they are coverage.

### Optional dynamic testing with Strix

Only if Strix is installed, Docker is available, and the target is authorized. Never point it at the live working tree; use a copy or worktree.

```bash
# Example: Ollama-backed Strix. Adjust model and paths.
export STRIX_LLM="ollama/kimi-k3.1-pro:cloud"
export LLM_API_BASE="http://localhost:11434"
export LLM_API_KEY="ollama"
export STRIX_API_TYPE="chat_completions"

strix \
  --target ./security-copy \
  --scan-mode quick \
  --max-turns 100 \
  -n
```

Strix is active exploitation: it needs Docker, may edit the mounted target, and local/Ollama tool-calling is less reliable than frontier models. Use `quick` or `standard`, cap turns/budget, and never test production.

## Phase 5 — Triage and report

1. Deduplicate findings across scanners and manual/red-team work.
2. Classify each as `confirmed`, `likely`, or `suspected`.
3. Assign severity: `critical`, `high`, `medium`, `low`, `info`.
4. Separate true positives from false positives; say why.
5. Verify fixes by rerunning the relevant scanner or exploit path.
6. Record coverage: tools/versions, paths reviewed/excluded, failed attempts, unavailable scanners.

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

- Keep secrets out of the report.
- Save scanner output under `/tmp/security-review-<timestamp>/`; only write a report into the repo if the user asks.
- If a scanner is missing or a phase was skipped, state the coverage gap explicitly.

## Stop conditions

Stop and report instead of continuing when:

- authorization or scope for active testing is missing;
- the target is production or third-party without written permission;
- a test could cause data loss, outage, or persistent access;
- a live secret is found: do not validate it; report location and rotate;
- the review would require unavailable credentials, targets, or scanners.
