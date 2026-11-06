/**
 * What is the agent doing right now, and is there a capability that does it better?
 *
 * The prompt classifier routes the *ask*; it cannot see the twentieth tool call. This module reads the
 * call itself, which is the only signal that arrives while the work is still changeable — the router's
 * own design doc names the gap: "New work has no route. When a session drifts into an unplanned area… 
 * no capability is suggested."
 *
 * Rules are local and deterministic: no model call, no latency, and every rule is a claim that can be
 * checked against a real tool call in a test. A rule fires only on a shape that is unambiguous — a
 * single-symbol text search is the clearest case, because serena answers it with LSP precision and a
 * regex grep cannot. Anything vaguer waits for a bounded classifier rather than guessing here.
 */
import { PRIMITIVES } from "./conformance.ts";

export const CLASSIFY_INTERVAL_MS = 10 * 60_000;

/**
 * Is the bounded classifier due? Approved drift handling, held back until the rules were measured.
 *
 * Measured on a real 107-call session (coloso-v2, 2026-11-06): the two local rules fired on nothing —
 * every search went through `bash grep`, and only two files were read. Narrow rules alone cover a
 * realistic run too poorly to be the whole answer, so the classifier is the fallback rather than the
 * exception. Bounded so it can never become a per-turn model call.
 */
export function classifyDue(state: { inFlight: boolean; lastAt: number; now: number; lastWork: string }): boolean {
	if (state.inFlight) return false;
	if (state.now - state.lastAt < CLASSIFY_INTERVAL_MS) return false;
	// Only when the work is being done by hand: a session already calling a capability needs no advice.
	// `""` is in PRIMITIVES, so an empty last step has to be rejected before the lookup or a fresh
	// turn would ask the classifier about nothing.
	if (!state.lastWork) return false;
	return PRIMITIVES.has(state.lastWork.split(":")[0]);
}

export interface Detection {
	/** Capability signature, in the router's vocabulary. */
	sig: string;
	/** The exact call to make, ready to paste. */
	syntax: string;
	/** Why it beats what the agent just did, in one clause. */
	why: string;
	/** The rule that fired, for the ledger. */
	rule: string;
}

/** A single identifier: what LSP navigation is for, and what a text search answers worst. */
const SYMBOL = /^[A-Za-z_$][\w$]*$/;

/** Longest pattern worth echoing back inside a hint; longer ones are regexes, not symbols. */
const MAX_PATTERN_CHARS = 60;

const quote = (value: string) => JSON.stringify(value);

/**
 * One tool call → at most one detection.
 *
 * `reads` is how many distinct files this session has already read; a module scan by hand is the case
 * the graph tools exist for, and three reads is the point where a by-hand scan is a pattern rather
 * than a look.
 */
export function detect(toolName: string, input: Record<string, unknown>, reads = 0): Detection | null {
	if (toolName === "grep") {
		const pattern = String(input.pattern ?? "");
		if (pattern.length > 0 && pattern.length <= MAX_PATTERN_CHARS && SYMBOL.test(pattern)) {
			return {
				sig: "mcp:serena",
				syntax: `mcp({server:"serena", tool:"find_symbol", args:{name_path_pattern:${quote(pattern)}, include_body:true}})`,
				why: "definition and references from the language server, not a text match",
				rule: "symbol-grep",
			};
		}
		return null;
	}
	if (toolName === "read" && reads >= 3) {
		return {
			sig: "mcp:codebase-memory-mcp",
			syntax: `mcp({server:"codebase-memory-mcp", tool:"get_architecture", args:{}})`,
			why: "the callers and layers of what you are reading, without opening each file",
			rule: "module-scan",
		};
	}
	return null;
}

/** The tail message. Short enough to reread every turn, and it names the exact call. */
export function renderDetection(detection: Detection): string {
	return `[capability-router] ${detection.syntax} — ${detection.why}. Ignore this if the primitive is enough.`;
}
