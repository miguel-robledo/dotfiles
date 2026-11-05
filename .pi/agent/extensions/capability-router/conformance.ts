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
 *   - a still-unused row is re-asserted after REASSERT_AFTER_TURNS turns, at most MAX_MENTIONS_PER_ROW
 *     times, and stops the moment the capability is actually used or the plan is replaced.
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
	// Agent rows are matched by agent name: one `reviewer` run must not satisfy a declared
	// `subagent:security-appsec-engineer` (measured: it did, and the appsec row never fired).
	if (toolName === "subagent") return typeof input.agent === "string" ? `subagent:${input.agent}` : "subagent";
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
		if (head === "subagent") {
			if (!rest) return seen === "subagent" || seen.startsWith("subagent:");
			return seen === `subagent:${rest}`;
		}
		return seen === sig || seen === head;
	});
}

export interface ConformanceState {
	rows: DeclaredRow[];
	observed: Set<string>;
	/** Turn index when each row was last mentioned, and how often. */
	mentionedAt: Map<string, number>;
	mentions: Map<string, number>;
	/** Turn counter, incremented once per turn_end. */
	turn: number;
	lastSpoke: number;
	spoken: number;
	planKey: string;
}

/** A still-unused row is re-asserted after this many turns, at most this many times. */
export const REASSERT_AFTER_TURNS = 5;
export const MAX_MENTIONS_PER_ROW = 3;

export function newState(): ConformanceState {
	return { rows: [], observed: new Set(), mentionedAt: new Map(), mentions: new Map(), turn: 0, lastSpoke: 0, spoken: 0, planKey: "" };
}

/** Is this row due to be mentioned again? Never mentioned → yes; otherwise after a gap, up to a cap. */
export function isDue(state: ConformanceState, row: DeclaredRow): boolean {
	const mentions = state.mentions.get(row.step) ?? 0;
	if (mentions === 0) return true;
	if (mentions >= MAX_MENTIONS_PER_ROW) return false;
	return state.turn - (state.mentionedAt.get(row.step) ?? 0) >= REASSERT_AFTER_TURNS;
}

/** Mark every given row as mentioned on the current turn. */
export function markMentioned(state: ConformanceState, rows: DeclaredRow[]): void {
	for (const row of rows) {
		state.mentions.set(row.step, (state.mentions.get(row.step) ?? 0) + 1);
		state.mentionedAt.set(row.step, state.turn);
	}
}

export interface PendingInput {
	state: ConformanceState;
	turnFamilies: string[];
	/** Skills already active as session mode; declared skills are advisory regardless. */
	satisfiedSkills?: Set<string>;
}

/**
 * Every declared capability this turn's work has bypassed. No session cap and no timer: one batch per
 * turn, each row mentioned once, and the caller filters out rows that cannot run for configuration
 * reasons. Measured: a three-message cap spent itself on three unusable mcp rows, and the appsec row
 * was never asked about.
 */
export function pendingCorrections({ state, turnFamilies, satisfiedSkills }: PendingInput): DeclaredRow[] {
	const families = workFamilies(turnFamilies);
	if (families.length === 0) return [];
	// Any work turn counts. Requiring "primitives only" silenced the check in real sessions whose turns
	// mixed playwright with bash while the declared serena row was still unused. Each row is named once,
	// so the total volume stays bounded by the plan's rows.
	return state.rows.filter(
		(row) =>
			!PRIMITIVES.has(row.family) &&
			// A declared skill is a process, not an act: reading SKILL.md is not evidence of applying it,
			// and a skill that is already the session's mode is never a tool call. Never enforced.
			row.family !== "skill" &&
			!satisfiedBy(row, [...state.observed]) &&
			isDue(state, row),
	);
}

/** Declared capabilities that are still unused, regardless of the mention schedule. */
export function unsatisfiedRows(state: ConformanceState): DeclaredRow[] {
	return state.rows.filter(
		(row) => !PRIMITIVES.has(row.family) && row.family !== "skill" && !satisfiedBy(row, [...state.observed]),
	);
}

/** One message listing every bypassed capability, so nothing is asked twice and nothing is left out. */
export function renderCorrections(rows: DeclaredRow[], turnFamilies: string[], maxLines = 8): string {
	const shown = rows.slice(0, maxLines);
	const used = [...new Set(workFamilies(turnFamilies))].slice(0, 5).join(", ") || "nothing";
	const lines = [
		`Capability check — ${rows.length} declared capabilit${rows.length === 1 ? "y is" : "ies are"} unused:`,
		...shown.map((row) => `- step "${row.step}" declared \`${row.sig}\``),
	];
	if (rows.length > shown.length) lines.push(`- … and ${rows.length - shown.length} more`);
	lines.push(`This turn used: ${used}. Use each declared capability, or say in one line why the primitive is enough.`);
	return lines.join("\n");
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

export interface StatusInput {
	state: ConformanceState;
	judge?: string;
	capabilities?: number;
	blocked?: Map<string, string>;
	reviewRounds?: number;
}

/**
 * Human-readable router status. Answers the two questions that kept coming up: is it alive, and does
 * it have anything left to say.
 */
export function renderStatus({ state, judge, capabilities, blocked, reviewRounds }: StatusInput): string {
	const unused = unsatisfiedRows(state);
	const due = unused.filter((row) => isDue(state, row));
	const lines = [
		"capability-router — loaded and evaluating every turn",
		judge ? `judge: ${judge}${capabilities ? ` over ${capabilities} capabilities` : ""}` : "judge: not registered",
		`plan: ${state.rows.length} capability rows restored`,
		`turn: ${state.turn} | mentions this session: ${state.spoken} | plan reviews: ${reviewRounds ?? 0}`,
		`unused: ${unused.length}${due.length ? ` (${due.length} due to be mentioned)` : " (none due right now)"}`,
	];
	for (const row of unused) {
		const mentions = state.mentions.get(row.step) ?? 0;
		const wait = mentions ? Math.max(0, REASSERT_AFTER_TURNS - (state.turn - (state.mentionedAt.get(row.step) ?? 0))) : 0;
		lines.push(`  - ${row.sig} — mentioned ${mentions}/${MAX_MENTIONS_PER_ROW}, ${wait === 0 ? "due now" : `${wait} turns until next`}`);
	}
	if (blocked && blocked.size > 0) {
		lines.push("blocked by configuration (reported to you, not to the model):");
		for (const [sig, reason] of blocked) lines.push(`  - ${sig}: ${reason.slice(0, 110)}`);
	}
	if (state.rows.length === 0) lines.push("no plan rows: nothing is being checked until a plan is submitted or restored at session start");
	return lines.join("\n");
}

const SIGNATURE = /\b(skill|mcp|subagent):([a-z0-9_.\/-]+)/gi;

/**
 * Fallback when a plan has no `## Capabilities` section: harvest the capability signatures the plan
 * mentions anywhere. Measured: three real plans named serena, codebase-memory-mcp and ponytail in
 * prose, the parser saw none of it, and 600 turns were checked against zero rows.
 */
export function harvestSignatures(plan: string, max = 20): DeclaredRow[] {
	const seen = new Map<string, DeclaredRow>();
	for (const line of plan.split("\n")) {
		for (const match of line.matchAll(SIGNATURE)) {
			const sig = `${match[1].toLowerCase()}:${match[2]}`.replace(/[.,;:)\-]+$/, "");
			if (seen.has(sig)) continue;
			seen.set(sig, { step: line.trim().slice(0, 60) || "mentioned in plan", sig, family: sig.split(":")[0] });
			if (seen.size >= max) return [...seen.values()];
		}
	}
	return [...seen.values()];
}

/** Rows for a plan: the declared table if present, otherwise what the plan mentions. */
export function deriveRows(plan: string): DeclaredRow[] {
	const declared = parseDeclaredRows(plan);
	return declared.length > 0 ? declared : harvestSignatures(plan);
}

/** `/router on`, `/capabilities report` … are commands, not the task. */
const isCommandText = (text: string) => /^\s*\/[a-z][\w-]*/.test(text) && !text.includes("\n");

/** The last substantive user message in a session, used when no plan was ever submitted. */
export function lastUserMessage(entries: Array<{ type?: string; message?: { role?: string; content?: unknown } }>): string | null {
	for (let index = entries.length - 1; index >= 0; index--) {
		const message = entries[index]?.message;
		if (message?.role !== "user") continue;
		const content = message.content;
		if (typeof content === "string") {
			if (isCommandText(content)) continue;
			return content;
		}
		if (!Array.isArray(content)) continue;
		const text = content
			.filter((block): block is { type: string; text: string } => typeof block === "object" && block !== null && (block as any).type === "text")
			.map((block) => block.text)
			.join("\n");
		if (text.trim() && !isCommandText(text)) return text;
	}
	return null;
}
