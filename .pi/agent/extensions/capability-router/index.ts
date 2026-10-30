/**
 * capability-router: make the installed inventory reachable, and prove whether it is.
 *
 * 1. Index agents/skills/MCP servers/packages from disk, once per session.
 * 2. Inject a compact, byte-stable capability map into the system prompt.
 * 3. Per user prompt, let Clef pick one capability from the whole inventory (or none) and add a
 *    two-line hint. Advisory only — the router never invokes anything.
 * 4. Activate `tool_search` so deferred and MCP tools stay discoverable.
 * 5. Record suggested-vs-used, and report coverage of the installed inventory.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { registerClef } from "./clef.ts";
import { projectBrief, type ProjectBrief } from "./context.ts";
import { planWorkstreams, type PlanSettings } from "./planner.ts";
import { buildCapabilities, buildIndex, renderCapabilitySection, type Capability, type CapabilityIndex } from "./indexer.ts";
import { CAPABILITY_PARAMS, inventoryLines, renderInventory } from "./inventory.ts";
import { familyOf, isPlanModeActive, lastPlanFromBranch, newState, nextCorrection, parseDeclaredRows, planHash, type ConformanceState } from "./conformance.ts";
import { extractSteps, findings, MAX_REVIEW_ROUNDS, parseRejections, renderFindings, type Finding, type StepJudgement } from "./plan-review.ts";
import { askTriggers, coverageFindings, mandatoryFindings, TRIGGERS, TRIGGER_THRESHOLD } from "./triggers.ts";
import { decide, DEFAULT_JUDGE, type JudgeOutcome } from "./judge.ts";
import { matchedBy, renderHint, toSuggestion, type RouteMap, type Suggestion } from "./router.ts";
import { agentDir, EXTENSION_DIR, formatCoverage, mineCoverage, writeJson, type Inventory } from "./report.ts";

const TOOL_SEARCH = "tool_search";
const USAGE_FILE = join(EXTENSION_DIR, "usage.jsonl");

const loadMap = (): RouteMap => {
	try {
		return JSON.parse(readFileSync(join(EXTENSION_DIR, "map.json"), "utf8")) as RouteMap;
	} catch {
		return {};
	}
};

function packageNames(pi: ExtensionAPI): string[] {
	try {
		const packages = (pi.getSettings() as { packages?: unknown }).packages;
		if (!Array.isArray(packages)) return [];
		return packages.map((entry) => {
			const source = typeof entry === "string" ? entry : String((entry as { source?: string })?.source ?? "");
			return source.slice(Math.max(source.lastIndexOf("/"), source.lastIndexOf(":")) + 1).replace(/@[^@]*$/, "") || source;
		});
	} catch {
		return [];
	}
}

function mcpNames(pi: ExtensionAPI): string[] {
	try {
		return pi.getMcpServers().map((server) => server.name);
	} catch {
		return [];
	}
}

function flagValue(argv: string[], name: string, fallback: number): number {
	const index = argv.indexOf(name);
	const value = index === -1 ? Number.NaN : Number(argv[index + 1]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface RunState {
	picks: Suggestion[];
	workstreams: number;
}

/** Total hints per prompt; each workstream may contribute up to judge.MAX_HINTS. */
const MAX_TOTAL_HINTS = 6;

export default function capabilityRouter(pi: ExtensionAPI) {
	const map = loadMap();
	const judge = { ...DEFAULT_JUDGE, ...(map.judge ?? {}) };
	const planner: PlanSettings = {
		timeoutMs: map.planner?.timeoutMs ?? 12000,
		maxWorkstreams: map.planner?.maxWorkstreams ?? 3,
	};
	const plannerEnabled = map.planner?.enabled !== false;
	const briefs = new Map<string, ProjectBrief>();
	// Registering the classifier is what makes Clef addressable at all: models.json cannot declare it.
	const judgeReady = map.judge?.enabled === false ? false : registerClef(pi, judge) !== null;

	let index: CapabilityIndex | null = null;
	let capabilities: Capability[] = [];
	let section = "";
	let sessionId = "";
	let run: RunState | null = null;
	let conformance: ConformanceState = newState();
	let turnFamilies: string[] = [];
	/** Rows from a plan submission, committed only once the tool call actually succeeds. */
	let pendingPlan: ReturnType<typeof parseDeclaredRows> | null = null;
	/** One review per distinct plan text, so an unchanged re-submission is not re-reviewed (A2). */
	const reviewedPlans = new Set<string>();
	/** Reviews sent this session; the second one is the last (measured: an unwinnable check looped 14x). */
	let reviewRounds = 0;
	/** Active-mode skills, for the inventory/telemetry only; declared skills are never enforced. */
	let activeModeSkills = new Set<string>();
	const cache = new Map<string, RunState>();

	const rebuild = () => {
		index = buildIndex(agentDir(), { mcpServers: mcpNames(pi), packages: packageNames(pi) });
		capabilities = buildCapabilities(index, map);
		section = renderCapabilitySection(index, map);
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		run = null;
		conformance = newState();
		turnFamilies = [];
		pendingPlan = null;
		reviewedPlans.clear();
		reviewRounds = 0;
		// A reload is required after editing the router; the plan must survive it.
		const restoredPlan = lastPlanFromBranch(ctx.sessionManager.getBranch() as any);
		if (restoredPlan) {
			const restored = parseDeclaredRows(restoredPlan);
			if (restored.length > 0) conformance.rows = restored;
		}
		rebuild();
		// Deferred/MCP tools are only discoverable through tool_search; never drop a tool the user chose.
		const active = pi.getActiveTools();
		if (!active.includes(TOOL_SEARCH) && pi.getAllTools().some((tool) => tool.name === TOOL_SEARCH)) {
			pi.setActiveTools([...active, TOOL_SEARCH]);
			pi.appendEntry("capability-router/tools", { before: active, after: [...active, TOOL_SEARCH] });
		}
	});

	// A slash command is human-only; this tool is how a model in the middle of a run reads the
	// actual inventory instead of relying on its memory of it.
	pi.registerTool({
		name: "capabilities",
		label: "Capabilities",
		description:
			"Inventory of installed capabilities: 78 agents, skills, MCP servers, packages, prompt templates. Use kind to pick a section, detail=full for descriptions, query to filter. Prefer this over guessing which capability exists.",
		parameters: CAPABILITY_PARAMS,
		async execute(_toolCallId, params) {
			if (!index) rebuild();
			const lines = inventoryLines(index!, map);
			const text = renderInventory(
				lines,
				params,
				(total) =>
					`capability inventory: ${total} entries, detail=${params.detail ?? "names"}. Agents: subagent({agent:"<name>"}). MCP: mcp({server:"<name>", tool:"<tool>"}). Skills: read ~/.pi/agent/skills/<name>/SKILL.md.`,
			);
			return { content: [{ type: "text", text }], details: { kind: params.kind ?? "all", detail: params.detail ?? "names" } };
		},
	});

	pi.on("resources_discover", () => {
		rebuild();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const sections = event.systemPromptOptions.sections;
		// Active mode skills (ponytail, caveman, …) appear as their own prompt section.
		const standard = new Set(["preamble", "tools", "rules", "docs", "project_context", "skills", "cwd", "capability_map", "routing_hint", "advertised_subagents", "pi_background_shell_policy"]);
		activeModeSkills = new Set(Object.keys(sections).filter((key) => !standard.has(key)));
		if (section) sections.capability_map = section;
		if (event.messageType !== "user") {
			delete sections.routing_hint;
			return;
		}

		const cacheKey = `${ctx.cwd}\u0000${event.prompt}`;
		// Plan mode: the prompt is the kickoff template, not a task. Classifying it produced generic
		// process-skill hints ("6 capabilities fit: test-driven-development, writing-plans…"). The plan
		// review routes per step instead, so stay silent here and skip the ~2 s planner call.
		if (isPlanModeActive(ctx.sessionManager.getBranch() as any)) {
			run = null;
			delete sections.routing_hint;
			return;
		}

		const cached = cache.get(cacheKey);
		if (cached) {
			run = cached;
			const hint = renderHint(cached.picks);
			if (hint) sections.routing_hint = hint;
			else delete sections.routing_hint;
			return;
		}

		let brief: ProjectBrief | null = null;
		if (plannerEnabled) {
			brief = briefs.get(ctx.cwd) ?? (await projectBrief(ctx.cwd));
			briefs.set(ctx.cwd, brief);
		}

		const classify = (text: string): Promise<JudgeOutcome> =>
			decide(text, capabilities, index!, ctx, judge).catch(
				(error): JudgeOutcome => ({ picks: [], source: "classifier", ms: 0, error: String(error) }),
			);

		// The raw prompt is always classified: it is the floor the planner adds to, never replaces.
		// (Measured: rewritten workstreams can classify weaker than the original text, and the planner
		// can answer "none" for a question that is plainly about the codebase.)
		const [direct, plan] = await Promise.all([
			classify(event.prompt),
			plannerEnabled
				? planWorkstreams(event.prompt, brief, ctx, planner)
				: Promise.resolve({ workstreams: [event.prompt], ms: 0, source: "fallback" as const }),
		]);
		const workstreamPicks =
			plan.source === "planner" && plan.workstreams.length > 1 ? await Promise.all(plan.workstreams.map(classify)) : [];

		const merged: Suggestion[] = [];
		const seen = new Set<string>();
		for (const outcome of [direct, ...workstreamPicks]) {
			for (const entry of outcome.picks) {
				const suggestion = toSuggestion(entry.capability);
				const key = `${suggestion.kind}:${suggestion.name}`;
				if (seen.has(key) || merged.length >= MAX_TOTAL_HINTS) continue;
				seen.add(key);
				merged.push(suggestion);
			}
		}
		run = { picks: merged, workstreams: plan.workstreams.length };
		if (cache.size > 50) cache.clear();
		cache.set(cacheKey, run);
		const hint = renderHint(run.picks);
		if (hint) sections.routing_hint = hint;
		else delete sections.routing_hint;
	});

	pi.on("tool_call", (event) => {
		const input = (event.input ?? {}) as Record<string, unknown>;
		turnFamilies.push(familyOf(event.toolName, input));
		if (event.toolName === "plan_mode_complete" && typeof input.plan === "string") {
			// Commit on success only: a rejected plan submission must not leave stale expectations.
			pendingPlan = parseDeclaredRows(input.plan);
		} else {
			conformance.observed.add(familyOf(event.toolName, input));
		}
		if (!run || run.picks.length === 0) return;
		for (const pick of run.picks) {
			if (matchedBy(event.toolName, input, pick)) {
				pi.appendEntry("capability-router/followed", { name: pick.name, kind: pick.kind });
			}
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "plan_mode_complete") return;
		const rows = pendingPlan;
		pendingPlan = null;
		if (!rows || event.isError || rows.length === 0) return;

		conformance.rows = rows;
		conformance.observed = new Set();
		conformance.reminded = new Set();
		conformance.spoken = 0;
		conformance.lastSpoke = 0;
		conformance.planKey = `${conformance.rows.length}:${rows[0].sig}`;

		// Plan-time review: classify the plan's own steps and send findings back so the *model* rewrites
		// the table. The router never edits the plan (measured: the model writes better and learns).
		const plan = typeof (event.input as { plan?: unknown })?.plan === "string" ? String((event.input as { plan: string }).plan) : "";
		if (reviewRounds >= MAX_REVIEW_ROUNDS) return;
		const hash = planHash(plan);
		if (reviewedPlans.has(hash)) return;
		reviewedPlans.add(hash);
		const steps = extractSteps(plan, 12);
		try {
			// Row-level judgement only applies to rows that exist; coverage runs even without a table
			// (a plan may legitimately declare "none" and still trigger obligations).
			const judged = new Map<number, StepJudgement>();
			await Promise.all(
				steps.map(async (step) => {
					const outcome = await decide(step.text, capabilities, index!, ctx, judge);
					const top = outcome.picks[0];
					if (top) judged.set(step.index, { id: top.capability.id, probability: top.probability });
				}),
			);
			// Coverage first: the checklist catches omissions that row-level selection cannot see.
			const model = ctx.modelRegistry.getModelOfType("classifier", judge.provider, judge.model) as never;
			const triggerProbabilities = model
				? await askTriggers(ctx, model, plan, judge.timeoutMs).catch(() => ({}))
				: {};
			const rejected = parseRejections(plan);
			const coverage = coverageFindings(triggerProbabilities, rows, undefined, undefined, rejected);
			// Obligations (anything a fired trigger requires) are exempt from "better fit" advice, whether
			// or not the plan already declares them. Otherwise the two checks contradict each other.
			const required = new Set(
				TRIGGERS.filter((trigger) => (triggerProbabilities[trigger.id] ?? 0) >= TRIGGER_THRESHOLD).map((trigger) => trigger.requires),
			);
			const list: Finding[] = [
				...mandatoryFindings(rows, rejected),
				...coverage,
				...findings(steps, rows, judged, index!, capabilities, { max: 6, required }),
			].slice(0, 8);
			if (list.length === 0) return;
			reviewRounds += 1;
			pi.appendEntry("capability-router/plan-review", {
				findings: list.length,
				rows: rows.length,
				steps: steps.length,
				triggers: Object.entries(triggerProbabilities).filter(([, p]) => p >= 0.2).map(([id]) => id),
			});
			pi.sendMessage(
				{ customType: "capability-router/plan-review", content: renderFindings(list), display: true },
				{ deliverAs: "steer" },
			);
		} catch {
			// Advisory: a failed review must never affect the plan or the run.
		}
	});

	// Conformance speaks at turn boundaries, only on a violation, within a hard noise budget.
	pi.on("turn_end", () => {
		const families = turnFamilies;
		turnFamilies = [];
		if (conformance.rows.length === 0) return;
		const correction = nextCorrection({ state: conformance, turnFamilies: families, now: Date.now(), satisfiedSkills: activeModeSkills });
		if (!correction) return;
		conformance.reminded.add(correction.row.step);
		conformance.spoken += 1;
		conformance.lastSpoke = Date.now();
		try {
			pi.sendMessage(
				{ customType: "capability-router/conformance", content: correction.text, display: true },
				// Measured: "nextTurn" is only consumed when a *new run* starts, so a mid-run correction
				// vanished. "steer" injects before the next model call inside the running loop.
				{ deliverAs: "steer" },
			);
		} catch {
			// Advisory only: never let a correction break the run.
		}
	});

	pi.on("agent_settled", () => {
		// A plan belongs to the run that submitted it: drop the rows when that run ends, so an
		// abandoned plan cannot nag the next one (measured: stale rows fired on unrelated turns).
		conformance = newState();
		if (!run) return;
		const row = {
			ts: new Date().toISOString(),
			session: sessionId,
			picks: run.picks.map((pick) => `${pick.kind}:${pick.name}`),
			workstreams: run.workstreams,
		};
		run = null;
		try {
			appendFileSync(USAGE_FILE, `${JSON.stringify(row)}\n`, "utf8");
		} catch {
			// Never let bookkeeping break the session.
		}
		pi.appendEntry("capability-router/usage", row);
	});

	pi.registerCommand("capabilities", {
		description: "Full capability inventory (same data as the `capabilities` tool), coverage report, and this session's hints",
		handler: async (args, ctx) => {
			const argv = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const days = flagValue(argv, "--days", 14);
			const branch = ctx.sessionManager.getBranch();
			const entriesOf = (customType: string) =>
				branch.filter((entry: any) => entry?.type === "custom" && entry?.customType === customType).map((entry: any) => entry.data);
			const rows = entriesOf("capability-router/usage");
			const followed = new Set(entriesOf("capability-router/followed").map((data: any) => data?.name));
			const session =
				rows.length === 0
					? "session hints: none yet"
					: [
							"session hints:",
							...rows.map((row: any) => {
								const picks: string[] = row.picks ?? (row.pick ? [row.pick] : []);
								if (picks.length === 0) return "  silent";
								return `  ${picks.map((pick) => (followed.has(pick.split(":")[1]) ? `${pick} (followed)` : pick)).join(", ")}`;
							}),
						].join("\n");

			try {
				if (argv[0] === "report" || argv[0] === "coverage") {
					const installed: Inventory = {
						agents: (index?.agents ?? []).map((agent) => agent.name),
						skills: index?.skills ?? [],
						mcp: index?.mcpServers ?? [],
					};
					const coverage = await mineCoverage(days, installed);
					writeJson(join(EXTENSION_DIR, `coverage-${coverage.days}d.json`), coverage);
					ctx.ui.notify(`${formatCoverage(coverage)}\n\n${session}`, "info");
					return;
				}

				if (!index) rebuild();
				const detail = argv.includes("--names") ? "names" : "full";
				const kindArg = argv.find((arg) => arg.startsWith("--kind="))?.slice("--kind=".length) as
					| "agents"
					| "skills"
					| "mcp"
					| "packages"
					| "prompts"
					| undefined;
				const queryIndex = argv.indexOf("--query");
				const queryArg =
					argv.find((arg) => arg.startsWith("--query="))?.slice("--query=".length) ??
					(queryIndex >= 0 ? argv[queryIndex + 1] : undefined);
				const judgeLine = judgeReady
					? `judge: ${judge.provider}/${judge.model} over ${capabilities.length} capabilities`
					: "judge: unavailable — router stays silent (check ollama + clef)";
				const text = `${renderInventory(
					inventoryLines(index!, map),
					{ kind: kindArg ?? "all", detail, query: queryArg },
					(total) =>
						`capability inventory: ${total} entries, detail=${detail}. Same data as the \`capabilities\` tool. Flags: --names, --kind=agents|skills|mcp|packages|prompts, --query <text>, report [--days N].`,
				)}\n\n${judgeLine}\n${session}`;
				// A 33k-char inventory belongs in the scrollback, not in a toast.
				if (text.length > 2000) pi.sendMessage({ customType: "capability-router/inventory", content: text, display: true }, {});
				else ctx.ui.notify(text, "info");
			} catch (error) {
				ctx.ui.notify(`capability-router failed: ${String(error)}`, "warning");
			}
		},
	});
}