/**
 * Clef on Ollama's cloud, registered as a first-class Pi classifier.
 *
 * Why this file exists: `models.json` model entries apply to chat models only, so a custom provider
 * cannot declare a classifier there. Extensions can — `registerProvider({ classifiers, models })` —
 * and Ollama exposes the System One API at `/v1/systemone` with body `{ model, state, questions }`,
 * which is byte-identical to what Pi's classifier client sends.
 *
 * Dialect differences handled here (verified against ollama 0.40.13 + clef:cloud):
 * - request: Ollama rejects `type: "bool"` (it wants `type: "noul"`); choice passes through.
 * - response: `noul` answers return `{ type: "noul", noul: <p> }`, not Pi's `{ type: "bool", probability }`.
 * - response: `score` answers return a normalized 0..1 value plus a legend; not mapped, because the
 *   expected-level semantics cannot be verified. Asking for one returns an explicit error.
 */
import type { ClassifierApi, ClassifierContext, ClassifierModel, ClassifierResult, ProviderClassifier } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CLEF_API: ClassifierApi = "typesafe-system-one";
export const CLEF_PROVIDER = "ollama-clef";

export interface ClefConfig {
	provider?: string;
	model?: string;
	baseUrl?: string;
	timeoutMs?: number;
}

interface OllamaAnswer {
	type?: string;
	choice?: string;
	probabilities?: Record<string, number>;
	confidence?: number;
	noul?: number;
	score?: number;
}

const errorResult = (model: ClassifierModel<ClassifierApi>, message: string, started: number): ClassifierResult => ({
	api: CLEF_API,
	provider: model.provider,
	model: model.id,
	answers: {},
	stopReason: "error",
	errorMessage: message,
	timestamp: started,
});

/** Pi's `bool` question is Ollama's `noul`. Choice and score keep their names. */
function toOllamaQuestions(questions: ClassifierContext["questions"]) {
	return Object.fromEntries(
		Object.entries(questions).map(([id, question]) => [
			id,
			question.type === "bool" ? { ...question, type: "noul" } : question,
		]),
	);
}

function fromOllamaAnswers(answers: Record<string, OllamaAnswer>): ClassifierResult["answers"] {
	const mapped: ClassifierResult["answers"] = {};
	for (const [id, answer] of Object.entries(answers ?? {})) {
		if (answer?.type === "choice" && typeof answer.choice === "string") {
			mapped[id] = {
				type: "choice",
				choice: answer.choice,
				probabilities: answer.probabilities ?? {},
				confidence: answer.confidence ?? 0,
			};
		} else if (answer?.type === "noul" && typeof answer.noul === "number") {
			mapped[id] = { type: "bool", probability: answer.noul };
		}
	}
	return mapped;
}

export function createOllamaClassifier(config: Required<Pick<ClefConfig, "baseUrl">> & { timeoutMs: number }): ProviderClassifier {
	return {
		async classify(model, context, options) {
			const started = Date.now();
			const url = new URL("systemone", `${config.baseUrl.replace(/\/+$/u, "")}/`);
			const timeout = AbortSignal.timeout(config.timeoutMs);
			const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
			try {
				const response = await fetch(url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						model: model.id,
						state: context.state,
						...(context.images?.length
							? { images: context.images.map((image) => `data:${image.mimeType};base64,${image.data}`) }
							: {}),
						questions: toOllamaQuestions(context.questions),
					}),
					signal,
				});
				const text = await response.text();
				if (!response.ok) return errorResult(model, `HTTP ${response.status}: ${text.slice(0, 300)}`, started);
				const body = JSON.parse(text) as { answers?: Record<string, OllamaAnswer>; usage?: { input_tokens?: number; output_tokens?: number } };
				const input = body.usage?.input_tokens ?? 0;
				const output = body.usage?.output_tokens ?? 0;
				return {
					api: CLEF_API,
					provider: model.provider,
					model: model.id,
					answers: fromOllamaAnswers(body.answers ?? {}),
					usage: {
						input,
						output,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: input + output,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: started,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return errorResult(model, signal.aborted ? `aborted or timed out after ${Date.now() - started}ms` : message, started);
			}
		},
	};
}

/** Register the provider once per extension runtime. Returns the model id it exposes, or null. */
export function registerClef(pi: ExtensionAPI, config: ClefConfig): string | null {
	const provider = config.provider ?? CLEF_PROVIDER;
	const modelId = config.model ?? "clef:cloud";
	const baseUrl = config.baseUrl ?? "http://localhost:11434/v1";
	const timeoutMs = config.timeoutMs ?? 8000;
	try {
		pi.registerProvider(provider, {
			name: "Clef (Ollama cloud)",
			baseUrl,
			apiKey: "ollama",
			classifiers: { [CLEF_API]: createOllamaClassifier({ baseUrl, timeoutMs }) },
			models: [
				{
					id: modelId,
					name: "Clef (Ollama cloud)",
					type: "classifier",
					api: CLEF_API,
					input: ["text", "image"],
					contextWindow: 65536,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				},
			],
		});
		return modelId;
	} catch {
		return null;
	}
}
