/**
 * Planner pass: one cheap chat call turns "the task + what this project is" into 1–3 workstreams.
 *
 * Why not ask the classifier this: measured 2026-10-30, Clef returned the *same* option for
 * "primary", "secondary" and "tertiary" questions on one task, so it cannot decompose. A chat model
 * can, and it can digest project context that the classifier ignores.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProjectBrief } from "./context.ts";

export const MAX_WORKSTREAMS = 3;

const SYSTEM_PROMPT = `You split a coding task into independent workstreams so a router can pick tools for each.

Rules:
- If the task is not about this codebase at all (arithmetic, general knowledge, chit-chat), output exactly: none
- Questions ABOUT this codebase ("who calls this", "where is X", "explain the architecture") ARE workstreams
- Otherwise output only the workstreams, one per line, no numbering, no bullets, no prose.
- 1 to 3 lines. One line when the task is a single piece of work.
- Each line: a short imperative sentence naming the concrete work, not a category.
- Use the project context to make lines specific (language, framework, files).
- Never invent work the user did not ask for.`;

/** The planner's explicit opt-out, used when the task has nothing to do with the project. */
export const isNoneAnswer = (text: string) => /^\s*none\s*[.!]?\s*$/i.test(text.trim());

/** Pure parser: numbered/bulleted lines, blank lines and prose are tolerated, noise is dropped. */
export function parseWorkstreams(text: string, max = MAX_WORKSTREAMS): string[] {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
		.filter((line) => line.length > 3 && line.length <= 200 && !/^(workstreams?|here (are|is))\b/i.test(line));
	return [...new Set(lines)].slice(0, max);
}

export interface PlanSettings {
	timeoutMs: number;
	maxWorkstreams: number;
	/** Defaults to the session model. */
	model?: string;
}

export interface PlanResult {
	workstreams: string[];
	ms: number;
	source: "planner" | "fallback" | "none";
	error?: string;
}

/** One chat call. Never throws: on any failure the task itself is the single workstream. */
export async function planWorkstreams(
	task: string,
	brief: ProjectBrief | null,
	ctx: ExtensionContext,
	settings: PlanSettings,
): Promise<PlanResult> {
	const started = Date.now();
	const fallback = (error?: string): PlanResult => ({ workstreams: [task], ms: Date.now() - started, source: "fallback", error });
	const model = ctx.model;
	if (!model) return fallback("no session model");

	try {
		const response = await ctx.modelRegistry.complete(
			model,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: `${brief ? `${brief.text}\n\n` : ""}task: ${task}`,
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				signal: AbortSignal.timeout(settings.timeoutMs),
				maxTokens: 400,
				// Reasoning models spend seconds thinking about a 1-3 line split; measured 2.4s -> 1.6s.
				samplingParams: { think: false },
			},
		);
		const text = response.content
			.filter((block): block is { type: "text"; text: string } => block.type === "text")
			.map((block) => block.text)
			.join("\n");
		if (isNoneAnswer(text)) return { workstreams: [], ms: Date.now() - started, source: "none" };
		const workstreams = parseWorkstreams(text, settings.maxWorkstreams);
		if (workstreams.length === 0) return fallback("planner produced no workstreams");
		return { workstreams, ms: Date.now() - started, source: "planner" };
	} catch (error) {
		return fallback(error instanceof Error ? error.message : String(error));
	}
}
