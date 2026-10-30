/**
 * Coverage check: the §2 triggers, asked as closed yes/no questions.
 *
 * Why this exists (measured 2026-10-30): the router is reliable at closed questions and weak at
 * choosing 1 of 145. A real plan declared 4 skills and missed 3 that its own protocol makes mandatory
 * (find-docs, error-handling-patterns, executing-plans) — nothing caught it, because selection can only
 * judge rows that exist. So coverage is asked separately: every §2 trigger becomes one `noul` question
 * over the plan text, and every "yes" creates an obligation to declare the capability it requires.
 *
 * Probe on that plan: 8 questions, 771 ms, 4.7k input tokens, 7/8 correct; true at 0.77–0.96, false at
 * 0.02–0.03, so 0.2 separates them.
 */
import type { ClassifierApi, ClassifierModel } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DeclaredRow } from "./conformance.ts";
import type { Finding } from "./plan-review.ts";

export interface Trigger {
	id: string;
	/** The closed question put to the classifier. */
	ask: string;
	/** Signature the plan must declare when the answer is yes. */
	requires: string;
	/** One clause explaining the obligation to the model. */
	why: string;
}

/** Mirrors `TOOLS.md` §2. Keep this list as the single machine-readable copy of the trigger table. */
export const TRIGGERS: Trigger[] = [
	{ id: "new_code", ask: "Does this plan write new source files or new functions?", requires: "skill:ponytail", why: "scope discipline applies before any new code" },
	{ id: "error_handling", ask: "Does this plan implement error handling, define an error taxonomy, or map failures to responses?", requires: "skill:error-handling-patterns", why: "error-handling design is the skill's trigger" },
	{ id: "runtime_api", ask: "Does this plan call Bun, HTTP, SQLite or framework APIs whose behaviour must be looked up rather than remembered?", requires: "skill:find-docs", why: "runtime API details must come from docs, not memory" },
	{ id: "public_contract", ask: "Does this plan add or change a public HTTP API contract: endpoints, status codes, parameters or headers?", requires: "skill:api-design-principles", why: "a public contract change is a design decision" },
	{ id: "input_surface", ask: "Does this plan add or change an input handler or an externally reachable surface?", requires: "skill:security-and-hardening", why: "new input surfaces are where hardening applies" },
	{ id: "tests_first", ask: "Does this plan implement a feature or a bugfix that should be written test-first?", requires: "skill:test-driven-development", why: "TDD is required for feature and bugfix work" },
	{ id: "inline_execution", ask: "Will an approved plan be executed inline in this same session?", requires: "skill:executing-plans", why: "inline execution has its own procedure" },
	{ id: "done_claim", ask: "Does this plan end with a 'done' claim, a commit or a pull request?", requires: "skill:verification-before-completion", why: "no completion claim without verification" },
	{ id: "unknown_failure", ask: "Does this plan diagnose a failure whose cause is not already known?", requires: "skill:systematic-debugging", why: "unknown failures need root-cause work before fixes" },
	{ id: "postgres", ask: "Does this plan touch a Postgres schema, migration or Postgres-specific SQL?", requires: "skill:supabase-postgres-best-practices", why: "Postgres schema and SQL authoring have their own rules" },
	{ id: "rust", ask: "Does this plan write or refactor Rust code?", requires: "skill:rust-best-practices", why: "Rust has language-specific practice rules" },
	{ id: "react", ask: "Does this plan write or refactor React or Next.js code?", requires: "skill:vercel-react-best-practices", why: "React/Next.js performance rules apply" },
	{ id: "browser", ask: "Does this plan drive or assert a real browser UI?", requires: "mcp:playwright", why: "browser work has no other real path here" },
	{ id: "callers", ask: "Does this plan need multi-hop caller or architecture analysis rather than a local read?", requires: "mcp:codebase-memory-mcp/trace_path", why: "call-graph questions exceed single-file reading" },
	{ id: "rename", ask: "Does this plan rename or move a symbol used in more than one file?", requires: "mcp:serena/rename_symbol", why: "a cross-file rename wants LSP precision" },
	{ id: "independent_verify", ask: "Does this plan need verification by something with no implementation context?", requires: "subagent:reviewer", why: "blackbox verification is a different context" },
	{ id: "a11y", ask: "Does this plan change a user-facing interface that needs an accessibility audit?", requires: "subagent:testing-accessibility-auditor", why: "WCAG auditing is a specialist check" },
	{ id: "security_review", ask: "Does this plan ship a new attack surface that needs an application-security review?", requires: "subagent:security-appsec-engineer", why: "appsec review is a specialist check" },
];

export const TRIGGER_THRESHOLD = 0.2;

/**
 * Capabilities every coding plan must address, either as a row (it will be used) or in the plan's
 * `Rejected:` line with a reason. They are not forced into the table: `serena` and
 * `codebase-memory-mcp` are mcp rows, which conformance enforces, so declaring one that cannot run here
 * (no index, no tsconfig) would create an obligation the run cannot satisfy.
 */
export const MANDATORY: Array<{ sig: string; why: string }> = [
	{ sig: "skill:ponytail", why: "scope discipline before any new code" },
	{ sig: "mcp:serena", why: "symbol-precise edits and LSP references" },
	{ sig: "mcp:codebase-memory-mcp", why: "call graph, architecture and blast radius" },
];

/**
 * Does a written signature cover a required one? `mcp:serena/rename_symbol` covers `mcp:serena`;
 * `mcp:playwright` does not.
 */
export function coversSignature(required: string, written: string): boolean {
	const want = required.toLowerCase();
	const have = written.toLowerCase();
	if (want === have) return true;
	const [head, rest = ""] = want.split(":");
	if (head === "mcp") {
		const [server, tool] = rest.split("/");
		if (tool) return have === `mcp:${server}/${tool}`;
		return have === `mcp:${server}` || have.startsWith(`mcp:${server}/`);
	}
	return false;
}

/** Mandatory capabilities that appear neither in the table nor in the Rejected line. Pure. */
export function mandatoryFindings(rows: DeclaredRow[], exclusions: string[] = [], mandatory = MANDATORY): Finding[] {
	const written = [...rows.map((row) => row.sig), ...exclusions];
	return mandatory
		.filter((entry) => !written.some((sig) => coversSignature(entry.sig, sig)))
		.map((entry) => ({
			step: "Mandatory capability not addressed",
			kind: "unaddressed-mandatory" as const,
			suggested: { sig: entry.sig, probability: 0, description: entry.why },
		}));
}

/** The batch of closed questions. `noul` is what Ollama expects for a yes/no. */
export function buildTriggerQuestions(triggers: Trigger[] = TRIGGERS) {
	return Object.fromEntries(
		triggers.map((trigger) => [
			trigger.id,
			{ type: "noul", instructions: trigger.ask, criteria: { true: "the plan does this", false: "the plan does not do this" } },
		]),
	);
}

/**
 * Triggers that fired without a matching declared row. Pure: the probabilities come from the caller.
 * Matching is by capability family and server/skill name, so `skill:find-docs` in the table satisfies
 * the `find-docs` trigger.
 */
export function coverageFindings(
	probabilities: Record<string, number>,
	rows: DeclaredRow[],
	triggers: Trigger[] = TRIGGERS,
	threshold = TRIGGER_THRESHOLD,
	exclusions: string[] = [],
): Finding[] {
	// A plan may reject a capability on the record ("Rejected: mcp:serena/rename_symbol — no tsconfig").
	// That is a documented deviation, not an omission; re-reporting it is the nag that gets ignored.
	const excluded = (requires: string) => exclusions.some((text) => text.toLowerCase().includes(requires.toLowerCase()));
	const declared = rows.map((row) => row.sig.toLowerCase());
	const satisfied = (requires: string) => declared.some((sig) => coversSignature(requires, sig));
	const out: Finding[] = [];
	for (const trigger of triggers) {
		const probability = probabilities[trigger.id] ?? 0;
		if (probability < threshold) continue;
		if (satisfied(trigger.requires) || excluded(trigger.requires)) continue;
		out.push({
			step: trigger.ask,
			kind: "missing-capability",
			suggested: { sig: trigger.requires, probability, description: trigger.why },
		});
	}
	return out;
}

/** One classifier call for the whole checklist. Never throws; returns {} on failure. */
export async function askTriggers(
	ctx: ExtensionContext,
	model: ClassifierModel<ClassifierApi>,
	plan: string,
	timeoutMs: number,
	triggers: Trigger[] = TRIGGERS,
): Promise<Record<string, number>> {
	const result = await ctx.modelRegistry.classify(model, { state: { plan }, questions: buildTriggerQuestions(triggers) } as never, {
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (result.stopReason !== "stop") return {};
	const probabilities: Record<string, number> = {};
	for (const [id, answer] of Object.entries(result.answers as Record<string, { type?: string; probability?: number }>)) {
		if (typeof answer?.probability === "number") probabilities[id] = answer.probability;
	}
	return probabilities;
}
