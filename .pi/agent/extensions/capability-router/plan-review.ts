/**
 * Plan-time review: does the plan's `## Capabilities` table actually name the best fits?
 *
 * Measured motivation: across 5 real plans the manual table used ~20 of 145 installed capabilities,
 * with six favourites doing most of the work. This module classifies each plan step and reports where
 * the router disagrees with the table.
 *
 * It never edits the plan. The model wrote the plan and the model rewrites it — the router only
 * supplies findings and the instruction to re-submit, which is what makes the model learn the mapping
 * instead of receiving a black-box table.
 */
import { parseDeclaredRows, PRIMITIVES, type DeclaredRow } from "./conformance.ts";
import type { Capability, CapabilityIndex } from "./indexer.ts";

/** One correction round, then trust the human/model: a second review cannot add information. */
export const MAX_REVIEW_ROUNDS = 2;

export interface PlanStep {
	index: number;
	text: string;
}

/**
 * The plan's own step list. A `## Capabilities` table is authoritative when present (its step cells
 * are the plan's own decomposition); headings are the fallback for plans without a table.
 */
export function extractSteps(plan: string, limit = 12): PlanStep[] {
	const declared = parseDeclaredRows(plan);
	if (declared.length > 0) {
		return declared.slice(0, limit).map((row, index) => ({ index, text: row.step }));
	}
	const steps: PlanStep[] = [];
	for (const line of plan.split("\n")) {
		const heading = /^#{2,4}\s*(?:\d+[.)]\s*)?(.{8,160})$/.exec(line.trim());
		const numbered = /^(\d+)[.)]\s+(.{8,160})$/.exec(line.trim());
		const text = heading?.[1]?.replace(/`/g, "") ?? numbered?.[2];
		if (!text) continue;
		if (/^(capabilities|rejected|risks|rollback|verification|open questions)\b/i.test(text)) continue;
		steps.push({ index: steps.length, text: text.trim() });
		if (steps.length >= limit) break;
	}
	return steps;
}

export interface Finding {
	step: string;
	declared?: string;
	suggested?: { sig: string; probability: number; description: string };
	kind: "better-fit" | "unknown-signature" | "missing-capability" | "unaddressed-mandatory";
}

/** What the router decided for one step: its best capability and how sure it was. */
export interface StepJudgement {
	id: string;
	probability: number;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Pair rows to steps: by index when the counts line up, otherwise by text containment. */
export function pairRows(steps: PlanStep[], rows: DeclaredRow[]): Array<{ step: PlanStep; row?: DeclaredRow }> {
	if (steps.length === rows.length) return steps.map((step, index) => ({ step, row: rows[index] }));
	return steps.map((step) => {
		const wanted = normalize(step.text).slice(0, 40);
		const row = rows.find((candidate) => {
			const have = normalize(candidate.step);
			return have.length > 0 && (have.includes(wanted) || wanted.includes(have));
		});
		return { step, row };
	});
}

/** Signatures the plan explicitly rejected, with its reason attached ("Rejected: a — why; b — why"). */
export function parseRejections(plan: string): string[] {
	const match = /\*\*Rejected:?\*\*|Rejected:/i.exec(plan);
	if (!match) return [];
	const from = plan.slice(match.index + match[0].length).split(/\n\s*\n/)[0];
	// Only capability signatures suppress a trigger; the sentence also names files and commands.
	return [...from.matchAll(/`((?:skill|mcp|subagent):[^`]+)`/g)].map((found) => found[1].trim());
}

/** Does the declared signature name something that exists? `mcp:serena` needs a serena server, etc. */
export function signatureExists(sig: string, index: CapabilityIndex): boolean {
	const [head, rest = ""] = sig.toLowerCase().split(":");
	if (PRIMITIVES.has(head)) return true;
	if (head === "mcp") return index.mcpServers.some((server) => rest.startsWith(server.toLowerCase()));
	// Builtin subagents (`reviewer`, `scout`, `worker`) and project agents are not in the roster file,
	// so an unknown agent name is not evidence of a mistake either.
	if (head === "subagent") return true;
	// A `skill:` may be repo-local (`openspec-propose` lives in the project, not in ~/.pi/agent), so an
	// unknown skill name is not evidence of a mistake. Unknown servers and agents are.
	if (head === "skill") return true;
	return false;
}

/**
 * Findings worth sending back to the model. Conservative: a disagreement is only reported when the
 * router is confident and the declared family differs, so the message stays short and actionable.
 */
export function findings(
	steps: PlanStep[],
	rows: DeclaredRow[],
	judged: Map<number, StepJudgement>,
	index: CapabilityIndex,
	capabilities: Capability[],
	options: { minProbability?: number; max?: number; required?: Set<string> } = {},
): Finding[] {
	// A capability that a fired trigger requires is an obligation. Suggesting "a better fit" for it is
	// not advice, it is a contradiction the model can never satisfy — measured: 14 plan resubmissions.
	const required = new Set([...(options.required ?? [])].map((sig) => sig.toLowerCase()));
	const capabilitiesById = new Map(capabilities.map((capability) => [capability.id, capability]));
	const minProbability = options.minProbability ?? 0.4;
	const max = options.max ?? 6;
	const out: Finding[] = [];
	for (const { step, row } of pairRows(steps, rows)) {
		const judgement = judged.get(step.index);
		const topCapability = judgement ? capabilitiesById.get(judgement.id) : undefined;
		const probability = judgement?.probability ?? 0;
		if (row && !signatureExists(row.sig, index)) {
			out.push({ step: step.text, declared: row.sig, kind: "unknown-signature" });
			continue;
		}
		// No row: nothing to disagree with. With custom-only tables there is no per-step row to miss,
		// and reporting omissions produced pure noise on every plan that used a native capability.
		if (!row) continue;
		const declaredFamily = row.sig.split(/[:/]/)[0].toLowerCase();
		// A primitive row is a deliberate choice; suggesting an agent instead is exactly the nag that
		// makes audits get ignored. Only compare capability-to-capability.
		if (PRIMITIVES.has(declaredFamily)) continue;
		if (required.has(row.sig.toLowerCase())) continue;
		const topFamily = topCapability ? topCapability.id.split(/[:/]/)[0].toLowerCase() : "";
		// Never compare across kinds: a process skill and an agent are different instruments, not
		// alternatives ("ponytail is worse than minimal-change-engineer" is not a statement about fit).
		if (topFamily !== declaredFamily) continue;
		// `mcp:serena` and `mcp:serena/rename_symbol` are the same decision, not a disagreement.
		const suggested = topCapability?.id.toLowerCase() ?? "";
		const declaredSig = row.sig.toLowerCase();
		const sameCapability =
			suggested === declaredSig ||
			(declaredFamily === "mcp" && suggested === `mcp:${declaredSig.split(":")[1]?.split("/")[0]}`);
		if (topCapability && probability >= minProbability && !sameCapability) {
			out.push({
				step: step.text,
				declared: row.sig,
				suggested: { sig: topCapability.id, probability, description: topCapability.description },
				kind: "better-fit",
			});
		}
		if (out.length >= max) break;
	}
	return out;
}

/** The message the model receives. Short, specific, and it asks for a re-submission, not silent edits. */
export function renderFindings(list: Finding[], options: { submit?: boolean } = {}): string {
	if (list.length === 0) return "";
	const lines = [
		`Plan capability review — ${list.length} capability issue${list.length === 1 ? "" : "s"}. Triggers are asked as closed questions; rows are judged against the installed inventory:`,
	];
	for (const finding of list) {
		if (finding.kind === "unaddressed-mandatory") {
			lines.push(
				`- mandatory capability not addressed: \`${finding.suggested?.sig}\` (${finding.suggested?.description ?? ""}). Add a row if it will be used, or reject it on the record with a reason.`,
			);
			continue;
		}
		if (finding.kind === "missing-capability") {
			lines.push(
				`- trigger fired: ${finding.step} — no row declares \`${finding.suggested?.sig}\` (p=${finding.suggested?.probability.toFixed(2)}). ${finding.suggested?.description ?? ""}`,
			);
			continue;
		}
		if (finding.kind === "unknown-signature") {
			lines.push(`- "${finding.step}" declares \`${finding.declared}\`, which is not installed.`);
			continue;
		}
		const p = finding.suggested ? ` (p=${finding.suggested.probability.toFixed(2)})` : "";
		const declared = finding.declared ? `declares \`${finding.declared}\`; ` : "has no capability row; ";
		lines.push(
			`- "${finding.step}" ${declared}better fit \`${finding.suggested?.sig}\`${p} — ${finding.suggested?.description.slice(0, 80)}`,
		);
	}
	lines.push(
		options.submit === false
			? "Add a row for each capability above, or state in one line why the step does not need it."
			: "Re-submit the plan with a corrected `| Step | Capability | Why |` table (call plan_mode_complete again, do not change the rest of the plan). Keep a row you disagree with if you can state why in its Why cell.",
	);
	return lines.join("\n");
}
