/**
 * Suggestion types and hint rendering. Selection lives in `judge.ts`: every installed capability is
 * offered to the classifier at once, and the number of hints follows how many options fit the task.
 */
import type { Capability } from "./indexer.ts";

export type SuggestionKind = "agent" | "skill" | "mcp";

export interface Suggestion {
	kind: SuggestionKind;
	name: string;
	syntax: string;
	/** Why this capability fits, in one clause. */
	why: string;
}

export interface RouteMap {
	judge?: {
		enabled?: boolean;
		provider?: string;
		model?: string;
		baseUrl?: string;
		timeoutMs?: number;
	};
	planner?: {
		enabled?: boolean;
		timeoutMs?: number;
		maxWorkstreams?: number;
	};
	/** Everything except the watching senior. `enabled: false` isolates `watch.ts` for measurement. */
	router?: { enabled?: boolean };
	/** The watching senior: a cheap chat model per turn. See `watch.ts`. */
	watch?: Partial<import("./watch.ts").WatchSettings>;
	syntax?: Record<string, string>;
	purposes?: Record<string, string>;
}

/** Header + up to four lines; measured hints land at 250–430 chars. */
export const HINT_MAX_CHARS = 700;
const WHY_MAX_CHARS = 60;

export const toSuggestion = (capability: Capability): Suggestion => ({
	kind: capability.kind,
	name: capability.name,
	syntax: capability.syntax,
	why: capability.description,
});

const short = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** One line per fitting capability, most likely first. Advisory text only. */
export function renderHint(suggestions: Suggestion[]): string {
	if (suggestions.length === 0) return "";
	const header =
		suggestions.length === 1
			? `Routing hint (capability-router): ${suggestions[0].kind} ${suggestions[0].name} fits this task.`
			: `Routing hint (capability-router): ${suggestions.length} capabilities fit this task, most likely first.`;
	const lines = suggestions.map((suggestion) => `${suggestion.syntax} — ${short(suggestion.why, WHY_MAX_CHARS)}`);
	const hint = [header, ...lines].join("\n");
	return hint.length <= HINT_MAX_CHARS ? hint : `${hint.slice(0, HINT_MAX_CHARS - 1).trimEnd()}…`;
}

/** Did a tool call follow this suggestion? Used for suggested-vs-used bookkeeping. */
export function matchedBy(toolName: string, input: Record<string, unknown>, suggestion: Suggestion): boolean {
	switch (suggestion.kind) {
		case "agent":
			return toolName === "subagent" && input.agent === suggestion.name;
		case "mcp":
			return toolName === `mcp__${suggestion.name}` || (toolName === "mcp" && input.server === suggestion.name);
		case "skill":
			return toolName === "read" && String(input.path ?? "").includes(`/skills/${suggestion.name}/`);
	}
}
