/**
 * In-run conformance: does the run use the capabilities the plan declared?
 *
 * Measured motivation (14 days): 5 plans with real capability tables, and `plan-audit` only reported
 * mismatches *after* the run — "declared X, observed nothing" with no consequence. This module speaks
 * during the run instead, under a hard noise budget:
 *
 *   - checked at `turn_end`, because a turn is the unit that carries tool calls and results
 *   - speaks only on a violation: a declared non-primitive capability is still unused while the turn
 *     used primitives for the same work
 *   - each declared row is reminded at most once, at most 3 lines per session, and never twice within
 *     two minutes. A wall-clock timer is a *silencer* here, never a trigger.
 *
 * No model calls: everything is string comparison over the plan and the tool names.
 */
import type { Capability } from "./indexer.ts";

export interface DeclaredRow {
	step: string;
	sig: string;
	family: string;
}

export const PRIMITIVES = new Set(["read", "bash", "grep", "find", "ls", "edit", "write", "none", "", "todo", "bg_run"]);

/**
 * Tools that are not work: submitting a plan, asking a question, tracking a todo, reading the
 * inventory. A turn that only did these has not bypassed anything, so conformance stays silent.
 * Measured defect: a plan-only turn was reported as "this turn used: plan_mode_complete".
 */
export const META_TOOLS = new Set([
	"plan_mode_complete",
	"plan_mode_question",
	"todo",
	"ask_user_question",
	"capabilities",
	"scratchpad",
	"contact_supervisor",
]);
const isMeta = (name: string) => META_TOOLS.has(name) || name.startsWith("bg_") || name.startsWith("memory_");

/** The tool families that count as work in a turn. */
export function workFamilies(families: string[]): string[] {
	return families.filter((family) => !isMeta(family.split(":")[0]));
}

/** Stable hash of a plan text, so an identical re-submission is reviewed once (defect A2). */
export function planHash(plan: string): string {
	let hash = 2166136261;
	const text = plan.replace(/\s+/g, " ").trim();
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `${(hash >>> 0).toString(16)}:${text.length}`;
}

/**
 * The last plan submitted in a transcript, so a `/reload` (required to apply a router fix) does not
 * lose the declared rows the run is being checked against (defect A4).
 */
export function lastPlanFromBranch(entries: Array<{ type?: string; message?: { content?: unknown } }>): string | null {
	for (let index = entries.length - 1; index >= 0; index--) {
		const content = entries[index]?.message?.content;
		if (!Array.isArray(content)) continue;
		for (const block of content as any[]) {
			if (block?.type === "toolCall" && block?.name === "plan_mode_complete" && typeof block.arguments?.plan === "string") {
				return block.arguments.plan;
			}
		}
	}
	return null;
}

/** The plan's `## Capabilities` table, strictly: only rows under that heading, only backticked cell 2. */
export function parseDeclaredRows(plan: string): DeclaredRow[] {
	const start = plan.indexOf("## Capabilities");
	if (start === -1) return [];
	const section = plan.slice(start + "## Capabilities".length).split(/\n## /)[0];
	const rows: DeclaredRow[] = [];
	for (const line of section.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|")) continue;
		const cells = trimmed.split("|").map((cell) => cell.trim());
		if (cells.length < 4) continue;
		const match = /`([^`]+)`/.exec(cells[2]);
		if (!match) continue;
		const sig = match[1].trim();
		if (!sig) continue;
		rows.push({ step: cells[1], sig, family: sig.split(/[:/]/)[0].toLowerCase() });
	}
	return rows;
}

/** Tool call → capability family, so a plan row can be matched against what actually ran. */
export function familyOf(toolName: string, input: Record<string, unknown>): string {
	if (toolName.startsWith("mcp__")) {
		const server = toolName.slice(5).replace(/_/g, "-");
		return typeof input.tool === "string" ? `mcp:${server}/${input.tool}` : `mcp:${server}`;
	}
	if (toolName === "mcp") {
		if (typeof input.server !== "string") return "mcp";
		return typeof input.tool === "string" ? `mcp:${input.server}/${input.tool}` : `mcp:${input.server}`;
	}
	if (toolName === "subagent") return "subagent";
	if (toolName === "read" && typeof input.path === "string") {
		const skill = /\/skills\/([^/]+)\//.exec(input.path);
		if (skill) return `skill:${skill[1]}`;
	}
	return toolName;
}

/** Is a declared signature satisfied by what actually ran? `mcp:serena/rename_symbol` ← `mcp:serena`. */
export function satisfiedBy(declared: DeclaredRow, observed: string[]): boolean {
	const sig = declared.sig.toLowerCase();
	const [head, rest = ""] = sig.split(":");
	return observed.some((entry) => {
		const seen = entry.toLowerCase();
		if (seen === sig) return true;
		if (head === "mcp") {
			const [server, tool] = rest.split("/");
			// A row that names a tool requires that tool. Matching at server level let `index_status`
			// satisfy a declared `trace_path` — the exact flaw plan-audit was retired for.
			if (tool) return seen === `mcp:${server}/${tool}`;
			return seen === `mcp:${server}` || seen.startsWith(`mcp:${server}/`);
		}
		if (head === "subagent") return seen === "subagent";
		return seen === sig || seen === head;
	});
}

export interface ConformanceState {
	rows: DeclaredRow[];
	observed: Set<string>;
	reminded: Set<string>;
	lastSpoke: number;
	spoken: number;
	planKey: string;
}

export const MAX_LINES = 3;
export const SILENCE_MS = 120_000;

export function newState(): ConformanceState {
	return { rows: [], observed: new Set(), reminded: new Set(), lastSpoke: 0, spoken: 0, planKey: "" };
}

export interface CorrectionInput {
	state: ConformanceState;
	turnFamilies: string[];
	now: number;
	/** Skills already active as session mode, kept for callers that know them; declared skills are advisory regardless. */
	satisfiedSkills?: Set<string>;
}

/**
 * The single correction to emit this turn, or null. Pure, so the budget and the ordering are testable.
 */
export function nextCorrection({ state, turnFamilies, now, satisfiedSkills }: CorrectionInput): { row: DeclaredRow; text: string } | null {
	if (state.spoken >= MAX_LINES) return null;
	if (now - state.lastSpoke < SILENCE_MS) return null;
	// A correction only makes sense when this turn actually did work, not when it submitted a plan.
	const families = workFamilies(turnFamilies);
	if (families.length === 0) return null;
	const usedOnlyPrimitives = families.every((family) => PRIMITIVES.has(family.split(":")[0]));
	const pending = state.rows.filter(
		(row) =>
			!PRIMITIVES.has(row.family) &&
			// A declared skill is a process, not an act: reading SKILL.md is not evidence of applying it,
			// and a skill that is already the session's mode is never a tool call. Never enforced.
			row.family !== "skill" &&
			!state.reminded.has(row.step) &&
			!satisfiedBy(row, [...state.observed]),
	);
	if (pending.length === 0) return null;
	const row = pending[0];
	// Stay silent while the run is doing exactly what the plan asked; speak when primitives stand in
	// for a declared capability, or when the declared capability simply never appears.
	if (!usedOnlyPrimitives && state.observed.size > 0) return null;
	const used = [...new Set(families)].slice(0, 4).join(", ") || "nothing";
	return {
		row,
		text: `Capability check: step "${row.step}" declared \`${row.sig}\`, still unused. This turn used: ${used}. Use the declared capability or say in one line why the primitive is enough.`,
	};
}

/**
 * Is plan mode active? Read from the session's own state entry (`plan-mode-state`), not by sniffing
 * the prompt: `/plan` + `/kickoff` means the prompt is a protocol template, and the plan is the real
 * task list. During planning the per-step review does the routing, so the prompt hint is suppressed.
 */
export function isPlanModeActive(entries: Array<{ type?: string; customType?: unknown; data?: unknown }>): boolean {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== "plan-mode-state") continue;
		const data = entry.data as { enabled?: unknown } | undefined;
		return data?.enabled === true;
	}
	return false;
}
