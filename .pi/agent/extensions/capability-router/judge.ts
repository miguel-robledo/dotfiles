/**
 * Capability selection: Clef (Ollama cloud, a real Pi classifier) sees every installed capability at
 * once and returns a probability for each. No keyword table, no lexical pre-filter — the words come
 * from each capability's own description.
 *
 * How many capabilities a prompt gets is decided by that distribution, not by a fixed count: a
 * focused task has one dominant option, a multi-part task spreads across several. Measured on this
 * machine (119 options, ~4.5k input tokens, 0.7–1.4 s, ≈$0.001 per message):
 *
 *   "perform a code quality and cybersecurity audit"  → 6 options above the floor
 *   "check accessibility: keyboard, contrast…"         → 1
 *   "what is 2+2" / "read /tmp/x.txt"                  → 0 (none wins)
 */
import type { ClassifierApi, ClassifierModel } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CLEF_PROVIDER } from "./clef.ts";
import type { Capability, CapabilityIndex } from "./indexer.ts";

/** Silence when the model thinks nothing clearly fits. */
export const NONE_FLOOR = 0.25;
/** Silence when the best option is too weak to act on. */
export const MIN_TOP = 0.12;
/** An option joins the hint when it clears both the absolute and the relative floor. */
export const MIN_PROBABILITY = 0.05;
export const RELATIVE_FLOOR = 0.15;
/**
 * Prompt budget beats completeness: the hint stops at the second suggestion.
 *
 * Measured over 475 hints in 14 days (`/capabilities efficacy`, run-scoped): all 21 that were acted on
 * came from position 0; the 119 hints in position 2 or later produced none, and the 134 in position 1
 * produced none either. The tail is dead weight that dilutes the one slot with a signal — but the
 * second slot is kept because 134 samples cannot prove a 0, and a two-part task would otherwise lose
 * its second half. One slot is the next step if position 1 is still empty after more data.
 */
export const MAX_HINTS = 2;
/**
 * Agents are held to a higher bar than mcp/skill suggestions. Measured on a real 13-row plan: agent
 * descriptions read "expert X who implements…", so any implementation-shaped step matched one at
 * p=0.20–0.29 and the router would have over-delegated four times. A persona is the weakest reason to
 * dispatch (Rule 4); below this bar, silence is better than a job-title suggestion.
 */
export const AGENT_MIN_PROBABILITY = 0.45;
const CRITERION_MAX_CHARS = 120;

export interface JudgeSettings {
	provider: string;
	model: string;
	timeoutMs: number;
}

export interface JudgeOutcome {
	picks: Array<{ capability: Capability; probability: number }>;
	source: "classifier";
	ms: number;
	error?: string;
}

export interface Selection {
	ids: string[];
	probabilities: Record<string, number>;
	reason?: string;
}

export const DEFAULT_JUDGE: JudgeSettings = { provider: CLEF_PROVIDER, model: "clef:cloud", timeoutMs: 8000 };

/** One closed choice question over the whole inventory. Exported for tests. */
export function buildQuestion(capabilities: Capability[], limit = 200) {
	const criteria: Record<string, string> = {};
	for (const capability of capabilities.slice(0, limit)) {
		const text = `${capability.kind} ${capability.name}: ${capability.description}`;
		criteria[capability.id] = text.length <= CRITERION_MAX_CHARS ? text : `${text.slice(0, CRITERION_MAX_CHARS - 1)}…`;
	}
	criteria.none = "no installed capability clearly fits this task";
	return {
		instructions:
			"Pick the capability that best fits the task. Pick 'none' unless at least one option clearly fits.",
		criteria,
	} as const;
}

/** Turn one probability distribution into an ordered set of capabilities. Pure, so it is testable. */
export function select(
	answers: Record<string, { type?: string; choice?: string; probabilities?: Record<string, number> }> | undefined,
	capabilities: Capability[],
): Selection {
	const answer = answers?.pick;
	if (!answer || answer.type !== "choice" || !answer.probabilities) {
		return { ids: [], probabilities: {}, reason: "classifier returned no choice" };
	}
	const known = new Set(capabilities.map((capability) => capability.id));
	const ranked = Object.entries(answer.probabilities)
		.filter(([id]) => known.has(id))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const none = answer.probabilities.none ?? 0;
	const probabilities = Object.fromEntries(ranked);
	if (none >= NONE_FLOOR) return { ids: [], probabilities, reason: `none ${none.toFixed(3)} ≥ ${NONE_FLOOR}` };
	const top = ranked[0];
	if (!top || top[1] < MIN_TOP) return { ids: [], probabilities, reason: `top ${(top?.[1] ?? 0).toFixed(3)} < ${MIN_TOP}` };
	const floor = Math.max(MIN_PROBABILITY, RELATIVE_FLOOR * top[1]);
	const ids = ranked
		.filter(([id, probability]) => probability >= floor && (!id.startsWith("agent:") || probability >= AGENT_MIN_PROBABILITY))
		.slice(0, MAX_HINTS)
		.map(([id]) => id);
	return { ids, probabilities, reason: ids.length ? undefined : `nothing above ${floor.toFixed(3)}` };
}

export async function decide(
	prompt: string,
	capabilities: Capability[],
	index: CapabilityIndex,
	ctx: ExtensionContext,
	settings: JudgeSettings,
): Promise<JudgeOutcome> {
	const started = Date.now();
	const empty = (error: string): JudgeOutcome => ({ picks: [], source: "classifier", ms: Date.now() - started, error });
	if (capabilities.length === 0) return empty("empty inventory");
	if (index.agents.length === 0) return empty("index not built");

	const model = ctx.modelRegistry.getModelOfType("classifier", settings.provider, settings.model) as
		| ClassifierModel<ClassifierApi>
		| undefined;
	if (!model) return empty(`classifier ${settings.provider}/${settings.model} not registered`);

	const result = await ctx.modelRegistry.classify(
		model,
		{ state: { task: prompt }, questions: { pick: { type: "choice", ...buildQuestion(capabilities) } } },
		{ signal: AbortSignal.timeout(settings.timeoutMs) },
	);
	const ms = Date.now() - started;
	if (result.stopReason !== "stop") return { picks: [], source: "classifier", ms, error: result.errorMessage ?? result.stopReason };

	const selection = select(result.answers as never, capabilities);
	const picks = selection.ids
		.map((id) => ({ capability: capabilities.find((capability) => capability.id === id)!, probability: selection.probabilities[id] }))
		.filter((entry) => entry.capability);
	return { picks, source: "classifier", ms, error: selection.reason };
}
