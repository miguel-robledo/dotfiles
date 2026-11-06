/**
 * The senior looking over the shoulder: a chat model reads what the agent just did and names the
 * capability that would have done it better.
 *
 * This is the one mechanism that has not been tried here. Everything before it judged the *prompt* —
 * the classifier picks a capability before any work exists, then the run proceeds without it. This
 * judges the *work*: real tool calls, with their arguments, after they happened. It is the
 * `type:"agent"` hook shape that Claude Code ships, wired to an advisory tail instead of a gate.
 *
 * It is deliberately cheap and deliberately ignorable: one small call per turn, one line out, and the
 * line lands at the tail where the model reads it before acting. The failure mode to watch for is a
 * senior who is wrong or repetitive, so a verdict naming something already used is dropped here, not
 * by the caller.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Capability } from "./indexer.ts";

export interface Verdict {
	/** Capability id, in the router's vocabulary (`mcp:serena`, `skill:find-docs`). */
	sig: string;
	/** The instruction, imperative and specific. */
	line: string;
}

export interface WatchSettings {
	enabled: boolean;
	provider: string;
	model: string;
	timeoutMs: number;
	maxTokens: number;
	/** Capabilities offered to the watcher. Agents are excluded: the ask is about this turn's work. */
	maxCatalog: number;
	/** Hard stop for a session, so a wrong watcher cannot talk forever. */
	maxMessages: number;
}

export const DEFAULT_WATCH: WatchSettings = {
	enabled: true,
	provider: "ollama",
	model: "deepseek-v4.1-flash:1017-cloud",
	timeoutMs: 12_000,
	maxTokens: 120,
	maxCatalog: 70,
	maxMessages: 20,
};

const SYSTEM_PROMPT = `You watch a coding agent work and tell it which capability would do the job better.

Output exactly one line, in this form:
<capability-id> | <imperative instruction, max 110 characters>

Or output exactly: SILENT

Rules:
- Use an id from the catalog. Never invent one, never explain.
- Name what to do next, with the tool and its argument ("use find_symbol on FormData").
- If the last action would have been better done another way, say so plainly: "that grep should have been find_symbol".
- Skip anything already used, anything inapplicable to this language or repo, and anything the work does not need.
- Silence is correct when the agent is already using the right tool.`;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** One line per capability, id and a short gloss. Descriptions are written for humans already. */
export function renderCatalog(capabilities: Capability[], used: Set<string>, max: number): string {
	return capabilities
		.filter((capability) => capability.kind !== "agent")
		.filter((capability) => !used.has(`${capability.kind}:${capability.name}`))
		.filter((capability) => {
			const id = `${capability.kind}:${capability.name}`;
			for (const seen of used) if (id.startsWith(`${seen}/`) || seen.startsWith(`${id}/`)) return false;
			return true;
		})
		.slice(0, max)
		.map((capability) => `${capability.kind}:${capability.name} — ${clip(capability.description, 90)}`)
		.join("\n");
}

export function renderUser(task: string, actions: string[], catalog: string): string {
	return [
		task ? `Task: ${clip(task, 400)}` : "Task: (unknown)",
		"",
		"Last actions, oldest first:",
		...actions.map((action, index) => `${index + 1}. ${action}`),
		"",
		"Catalog:",
		catalog,
	].join("\n");
}

/**
 * Parse the watcher's answer. Anything that is not a catalog id followed by an instruction is silence:
 * a wrong id is worse than no advice, because the caller would render a call the model cannot make.
 */
export function parseVerdict(text: string, known: Set<string>): Verdict | null {
	const line = text
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.find((entry) => entry.length > 0);
	if (!line || /^silent\b/i.test(line)) return null;
	const [rawSig, ...rest] = line.split("|");
	const sig = (rawSig ?? "").trim().replace(/^[`"'*]+|[`"'*]+$/g, "");
	const instruction = rest.join("|").trim().replace(/^[`"'*]+|[`"'*]+$/g, "");
	if (!known.has(sig) || instruction.length === 0) return null;
	return { sig, line: clip(instruction, 140) };
}

export interface WatchCall {
	task: string;
	actions: string[];
	catalog: string;
}

/** One chat call. Never throws: a watcher failure is silence, never a stalled turn. */
export async function askWatcher(ctx: ExtensionContext, call: WatchCall, settings: WatchSettings): Promise<Verdict | null> {
	const model = ctx.modelRegistry.find(settings.provider, settings.model) ?? ctx.model;
	if (!model) return null;
	try {
		const response = await ctx.modelRegistry.complete(
			model as never,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: renderUser(call.task, call.actions, call.catalog) }],
						timestamp: Date.now(),
					},
				],
			},
			{ signal: AbortSignal.timeout(settings.timeoutMs), maxTokens: settings.maxTokens, samplingParams: { think: false } },
		);
		const text = response.content
			.filter((block): block is { type: "text"; text: string } => block.type === "text")
			.map((block) => block.text)
			.join("\n");
		return parseVerdict(text, new Set(call.catalog.split("\n").map((row) => row.split(" — ")[0])));
	} catch {
		return null;
	}
}

/** The tail line the working session sees. */
export function renderVerdict(verdict: Verdict): string {
	return `[capability-router] ${verdict.sig}: ${verdict.line}`;
}
