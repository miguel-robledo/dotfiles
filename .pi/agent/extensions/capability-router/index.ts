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
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { registerClef } from "./clef.ts";
import { projectBrief, type ProjectBrief } from "./context.ts";
import { planWorkstreams, type PlanSettings } from "./planner.ts";
import { buildCapabilities, buildIndex, renderCapabilitySection, type Capability, type CapabilityIndex } from "./indexer.ts";
import { CAPABILITY_PARAMS, inventoryLines, renderInventory } from "./inventory.ts";
import { alreadyUsed, deriveRows, familyOf, isPlanModeActive, lastPlanFromBranch, lastUserMessage, setKnownServers, markMentioned, newState, parseDeclaredRows, pendingCorrections, planHash, renderCorrections, renderStatus, unsatisfiedRows, workFamilies, type ConformanceState } from "./conformance.ts";
import { extractSteps, findings, MAX_REVIEW_ROUNDS, parseRejections, renderFindings, type Finding, type StepJudgement } from "./plan-review.ts";
import { askTriggers, coverageFindings, mandatoryFindings, TRIGGERS, TRIGGER_THRESHOLD } from "./triggers.ts";
import { cbmIndexPath, configuredBrowserPath, probeCapability, whichOnPath } from "./availability.ts";
import { decide, DEFAULT_JUDGE, type JudgeOutcome } from "./judge.ts";
import { matchedBy, renderHint, toSuggestion, type RouteMap, type Suggestion } from "./router.ts";
import { agentDir, EXTENSION_DIR, formatCoverage, mineCoverage, writeJson, type Inventory } from "./report.ts";
import { efficacyFor, formatEfficacy } from "./efficacy.ts";
import { classifyDue, detect, renderDetection, type Detection } from "./detect.ts";
import { askWatcher, DEFAULT_WATCH, renderCatalog, renderVerdict, type Verdict, type WatchSettings } from "./watch.ts";

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
	/** When the hint was shown. The row is written at settle, so `ts` is the END of the run. */
	shownAt: string;
}

/**
 * Total hints per prompt. The merged list is what the model reads, so the measured budget applies
 * here: every hint that was acted on came from position 0, and positions 2+ produced none.
 */
const MAX_TOTAL_HINTS = 2;

export default function capabilityRouter(pi: ExtensionAPI) {
	const map = loadMap();
	const judge = { ...DEFAULT_JUDGE, ...(map.judge ?? {}) };
	const planner: PlanSettings = {
		timeoutMs: map.planner?.timeoutMs ?? 12000,
		maxWorkstreams: map.planner?.maxWorkstreams ?? 3,
	};
	const plannerEnabled = map.planner?.enabled !== false;
	const watch: WatchSettings = { ...DEFAULT_WATCH, ...(map.watch ?? {}) };
	const watchEnabled = watch.enabled && watch.provider !== "";
	// One switch for everything the router does except the watching senior: head hint, rule detector,
	// bounded classifier, plan review, conformance nagging. Used to test the senior in isolation.
	const routerEnabled = map.router?.enabled !== false;
	const briefs = new Map<string, ProjectBrief>();
	// Registering the classifier is what makes Clef addressable at all: models.json cannot declare it.
	const judgeReady = map.judge?.enabled === false ? false : registerClef(pi, judge) !== null;

	let index: CapabilityIndex | null = null;
	let capabilities: Capability[] = [];
	let section = "";
	let sessionId = "";
	let run: RunState | null = null;
	// What the last tool call implies, and which detections have already been shown this session.
	// A tail line is shown once per capability per session: repeating it is the nagging that got the
	// first router ignored.
	let pendingDetection: Detection | null = null;
	let pendingWatch: Verdict | null = null;
	let watchInFlight = false;
	let watchSpoken = 0;
	let watchFiredThisTurn = false;
	// What the turn actually did, in enough detail for the watcher to judge it: a family name alone
	// (`bash`) cannot distinguish a symbol grep from a test run.
	let turnActions: string[] = [];
	let pendingClassified: Detection | null = null;
	const nudged = new Set<string>();
	const readPaths = new Set<string>();
	// Bounded drift detection: at most one classifier call per CLASSIFY_INTERVAL_MS, and only while the
	// work is being done by hand.
	let lastWork = "";
	let lastClassifyAt = 0;
	let classifyInFlight = false;
	let conformance: ConformanceState = newState();
	let turnFamilies: string[] = [];
	/** Work turns seen while the router had no rows to check; drives the one-time idle notice. */
	let workTurnsWithoutRows = 0;
	let idleNoticeSent = false;
	/** Rows from a plan submission, committed only once the tool call actually succeeds. */
	let pendingPlan: ReturnType<typeof parseDeclaredRows> | null = null;
	/** One review per distinct plan text, so an unchanged re-submission is not re-reviewed (A2). */
	const reviewedPlans = new Set<string>();
	/** Reviews sent this session; the second one is the last (measured: an unwinnable check looped 14x). */
	let reviewRounds = 0;
	/** Active-mode skills, for the inventory/telemetry only; declared skills are never enforced. */
	let activeModeSkills = new Set<string>();
	/** Servers that returned a real error this session, with that error: the only trustworthy signal. */
	const serverFailures = new Map<string, string>();
	/** Capabilities reported to the user as unusable here, for `/capabilities status`. */
	let blockedRows = new Map<string, string>();
	const cache = new Map<string, RunState>();

	/** Footer status: set on every turn, wrapped so a UI without a footer cannot break the turn. */
	const updateStatus = (ctx: { hasUI?: boolean; ui?: { setStatus?: (key: string, text: string | undefined) => void } }) => {
		try {
			if (!ctx?.hasUI || !ctx.ui?.setStatus) return;
			const unused = conformance.rows.filter((row) => !["read", "bash", "edit", "write", "grep", "find", "ls", "none", "todo", "bg_run", "skill"].includes(row.family));
			const label =
				conformance.rows.length === 0
					? "router: no plan"
					: `router: ${unused.length} unused, ${blockedRows.size} blocked, ${conformance.spoken} mentioned`;
			ctx.ui.setStatus("capability-router", label);
		} catch {
			// Status is cosmetic.
		}
	};

	const rebuild = () => {
		index = buildIndex(agentDir(), { mcpServers: mcpNames(pi), packages: packageNames(pi) });
		capabilities = buildCapabilities(index, map);
		section = renderCapabilitySection(index, map);
		// The gateway's second call shape carries the server in the tool name; the resolver needs the
		// installed names to split it.
		setKnownServers(index.mcpServers);
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		run = null;
		conformance = newState();
		blockedRows = new Map();
		turnFamilies = [];
		pendingPlan = null;
		reviewedPlans.clear();
		reviewRounds = 0;
		// A reload is required after editing the router; the plan must survive it.
		const restoredPlan = lastPlanFromBranch(ctx.sessionManager.getBranch() as any);
		const restoredRows = restoredPlan ? deriveRows(restoredPlan) : [];
		if (restoredRows.length > 0) conformance.rows = restoredRows;
		updateStatus(ctx);
		pi.appendEntry("capability-router/restored", {
			planFound: Boolean(restoredPlan),
			rows: restoredRows.length,
			firstRow: restoredRows[0]?.sig ?? null,
		});
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
		if (!routerEnabled) {
			run = null;
			delete sections.routing_hint;
			return;
		}
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

		// No plan, but the task itself may name capabilities (a pasted plan, a task brief). Adopt them
		// rather than staying idle: measured qa-coloso session had 600 turns with zero rows for this reason.
		if (conformance.rows.length === 0) {
			const adopted = deriveRows(event.prompt);
			if (adopted.length > 0) {
				conformance.rows = adopted;
				pi.appendEntry("capability-router/adopted", { source: "prompt", rows: adopted.map((row) => row.sig) });
			}
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
		run = { picks: merged, workstreams: plan.workstreams.length, shownAt: new Date().toISOString() };
		if (cache.size > 50) cache.clear();
		cache.set(cacheKey, run);
		const hint = renderHint(run.picks);
		if (hint) sections.routing_hint = hint;
		else delete sections.routing_hint;
	});

	pi.on("tool_call", (event) => {
		const input = (event.input ?? {}) as Record<string, unknown>;
		// Read the call before the bookkeeping below: this is the only place a capability gap is visible
		// while the work can still change.
		pendingDetection = routerEnabled ? detect(event.toolName, input, readPaths.size) : null;
		if (event.toolName === "read" && typeof input.path === "string") readPaths.add(input.path);
		const family = familyOf(event.toolName, input);
		if (workFamilies([family]).length > 0) lastWork = family;
		turnActions.push(`${event.toolName} ${JSON.stringify(input)}`.slice(0, 160));
		turnFamilies.push(family);
		if (event.toolName === "plan_mode_complete" && typeof input.plan === "string") {
			// Commit on success only: a rejected plan submission must not leave stale expectations.
			pendingPlan = deriveRows(input.plan);
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

	// The nudge at the tail, not the head. The head section is written once per run and stays static for
	// every turn of it; this lands immediately after the tool result the model just read, which is where
	// it is actually looked at. Once per capability per session.
	pi.on("context", (event) => {
		// Precedence: a rule that read the actual call, then the senior who read the turn, then the
		// classifier that only saw the prompt.
		const source = pendingDetection ?? pendingWatch ?? pendingClassified;
		if (!source) return;
		if (source === pendingDetection) pendingDetection = null;
		else if (source === pendingWatch) pendingWatch = null;
		else pendingClassified = null;
		const isRule = "rule" in source;
		const sig = source.sig;
		const text = isRule ? renderDetection(source as Detection) : renderVerdict(source as Verdict);
		// Never name what the session has already done, and never repeat: measured on the fixture run,
		// the classifier nudged a skill the model had read 14 seconds earlier.
		if (nudged.has(sig) || alreadyUsed(sig, conformance.observed)) return;
		nudged.add(sig);
		// Persisted breadcrumb: the injected message itself is per-request and never lands in the
		// transcript, so without this line the tail is unobservable from a session file (and the whole
		// mechanism is unfalsifiable).
		try {
			pi.appendEntry("capability-router/nudge", { sig, rule: isRule ? (source as Detection).rule : "watch" });
		} catch {
			// Bookkeeping must never break a run.
		}
		return { messages: [...event.messages, { role: "system", content: text }] };
	});

	// Drift: a run that has been doing the work by hand for a while gets one classifier look, so a
	// capability the prompt-time picker missed can still be named while the work is changeable. Fired
	// and forgotten — the handler must not put a two-second model call in front of the next turn.
	pi.on("turn_end", async (_event, ctx) => {
		if (!routerEnabled || !judgeReady || !index) return;
		const now = Date.now();
		if (!classifyDue({ inFlight: classifyInFlight, lastAt: lastClassifyAt, now, lastWork })) return;
		const task = lastUserMessage(ctx.sessionManager.getBranch() as any);
		if (!task) return;
		lastClassifyAt = now;
		classifyInFlight = true;
		void decide(`${task}\n\nMost recent step: ${lastWork}`, capabilities, index, ctx, judge)
			.then((outcome) => {
				const top = outcome.picks[0];
				if (!top) return;
				const suggestion = toSuggestion(top.capability);
				pendingClassified = {
					sig: `${suggestion.kind}:${suggestion.name}`,
					syntax: suggestion.syntax,
					why: suggestion.why,
					rule: "classifier",
				};
			})
			.catch(() => {
				// Advisory only: a classifier failure is silence, never a broken run.
			})
			.finally(() => {
				classifyInFlight = false;
			});
	});

	// The senior speaks mid-turn, not at the end of it.
	//
	// Measured on a two-turn probe: firing at `turn_end` produced a correct verdict ("use find_references
	// on reconcileLedgerEntry") that arrived after the run's last request, so it was never delivered. One
	// call per turn is the right budget; the wrong moment is what made it useless. Firing after the
	// second action leaves the model ~1 s of work to finish, which is enough for the verdict to be ready
	// when the next request is built.
	pi.on("tool_result", async (_event, ctx) => {
		if (!watchEnabled || !index || watchInFlight || watchFiredThisTurn) return;
		if (watchSpoken >= watch.maxMessages || pendingWatch || turnActions.length < 2) return;
		const task = lastUserMessage(ctx.sessionManager.getBranch() as any) ?? "";
		const catalog = renderCatalog(capabilities, conformance.observed, watch.maxCatalog);
		if (!catalog) return;
		watchFiredThisTurn = true;
		watchInFlight = true;
		watchSpoken += 1;
		const actions = [...turnActions];
		await askWatcher(ctx, { task, actions, catalog }, watch)
			.then((verdict) => {
				const kept = verdict && !nudged.has(verdict.sig) && !alreadyUsed(verdict.sig, conformance.observed) ? verdict : null;
				try {
					pi.appendEntry("capability-router/watch", {
						verdict: kept ? kept.sig : null,
						spoken: kept ? kept.line : null,
						dropped: verdict && !kept ? verdict.sig : null,
					});
				} catch {
					// Bookkeeping must never break a run.
				}
				if (kept) pendingWatch = kept;
			})
			.catch(() => {
				// A watcher failure is silence, never a stalled turn.
			})
			.finally(() => {
				watchInFlight = false;
			});
	});

	pi.on("tool_result", (event) => {
		// Remember genuine MCP failures (missing index, missing language server) so the human is told the
		// real reason instead of a guess.
		const server =
			event.toolName === "mcp" ? String((event.input as { server?: unknown })?.server ?? "") :
			event.toolName.startsWith("mcp__") ? event.toolName.slice(5).replace(/_/g, "-") : "";
		if (server && event.isError) {
			const text = (event.content ?? []).find((block) => block.type === "text") as { text?: string } | undefined;
			serverFailures.set(server, String(text?.text ?? "error").slice(0, 200));
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "plan_mode_complete") return;
		const rows = pendingPlan;
		pendingPlan = null;
		if (!rows || event.isError || rows.length === 0) return;

		conformance.rows = rows;
		conformance.observed = new Set();
		conformance.mentionedAt = new Map();
		conformance.mentions = new Map();
		conformance.spoken = 0;
		conformance.lastSpoke = 0;
		conformance.planKey = `${conformance.rows.length}:${rows[0].sig}`;

		if (!routerEnabled) return;
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
	pi.on("turn_end", (_event, ctx) => {
		conformance.turn += 1;
		const families = turnFamilies;
		const actions = turnActions;
		turnFamilies = [];
		turnActions = [];
		watchFiredThisTurn = false;
		const pending = routerEnabled
			? pendingCorrections({ state: conformance, turnFamilies: families, satisfiedSkills: activeModeSkills })
			: [];
		// Trace first, unconditionally: "the check never ran" and "the check ran and had nothing to say"
		// must be distinguishable from the transcript.
		pi.appendEntry("capability-router/evaluated", {
			rows: conformance.rows.length,
			pending: pending.map((row) => row.sig),
			work: families.length,
		});
		updateStatus(ctx);
		if (conformance.rows.length === 0) return;
		if (pending.length === 0) return;

		// Split the batch: capabilities that cannot run here are the human's problem, not the agent's.
		const usable: typeof pending = [];
		for (const row of pending) {
			if (row.family === "mcp") {
				const server = row.sig.split(":")[1]?.split("/")[0] ?? "";
				const observed = serverFailures.get(server);
				if (observed) {
					markMentioned(conformance, [row]);
					blockedRows.set(row.sig, observed);
					const note = `capability-router: \`${row.sig}\` is declared in the plan but \`${server}\` failed here: ${observed}`;
					if (ctx.hasUI) ctx.ui.notify(note, "warning");
					pi.appendEntry("capability-router/blocked", { sig: row.sig, reason: observed });
					continue;
				}
				const precondition = probeCapability(row.sig, {
					language: briefs.get(ctx.cwd)?.language,
					which: whichOnPath,
					exists: existsSync,
					browserPath: configuredBrowserPath(),
					cbmDbPath: cbmIndexPath(ctx.cwd),
				});
				if (!precondition.usable) {
					markMentioned(conformance, [row]);
					blockedRows.set(row.sig, precondition.reason ?? "unusable");
					const note = `capability-router: \`${row.sig}\` is declared in the plan but cannot run here — ${precondition.reason}. To fix: ${precondition.fix}.`;
					if (ctx.hasUI) ctx.ui.notify(note, "warning");
					pi.appendEntry("capability-router/blocked", { sig: row.sig, reason: precondition.reason, fix: precondition.fix });
					continue;
				}
			}
			usable.push(row);
		}
		if (usable.length === 0) return;
		markMentioned(conformance, usable);
		conformance.spoken += 1;
		updateStatus(ctx);
		conformance.lastSpoke = Date.now();
		try {
			pi.sendMessage(
				{ customType: "capability-router/conformance", content: renderCorrections(usable, families), display: true },
				{ deliverAs: "steer" },
			);
		} catch {
			// Advisory only: never let a correction break the run.
		}
	});

	pi.on("agent_settled", () => {
		// Rows are NOT cleared here. Measured on a real task: the plan was submitted in one run and
		// executed in later runs, so clearing at settle deleted the rows before the work began and the
		// check never fired. Rows persist until a new plan replaces them; the per-row reminder, the
		// 3-per-session cap and the 2-minute silencer keep an abandoned plan from nagging.
		if (!run) return;
		const row = {
			ts: new Date().toISOString(),
			// `shownAt` is the only timestamp a measurement may use: `ts` is when the row settles, which is
			// after every tool call the hint was supposed to influence.
			shownAt: run.shownAt,
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

	// Manual control: the operator's answer to "is it alive, and make it speak now".
	pi.registerCommand("router", {
		description: "Router control: /router [status|on|check|kick|review [kick]]",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().split(/\s+/)[0] || "status";
			const lines: string[] = [];
			try {
				if (sub === "on") {
					const branch = ctx.sessionManager.getBranch() as any;
					const plan = lastPlanFromBranch(branch);
					let rows = plan ? deriveRows(plan) : [];
					let source = "plan";
					if (rows.length === 0) {
						const task = lastUserMessage(branch);
						if (task) {
							rows = deriveRows(task);
							source = "task text";
						}
						// Still nothing named: ask the trigger checklist about the task itself.
						if (rows.length === 0 && task) {
							const classifier = ctx.modelRegistry.getModelOfType("classifier", judge.provider, judge.model) as never;
							if (classifier) {
								const probabilities = await askTriggers(ctx, classifier, task, judge.timeoutMs).catch(() => ({}));
								rows = TRIGGERS.filter((trigger) => (probabilities[trigger.id] ?? 0) >= TRIGGER_THRESHOLD).map((trigger, index) => ({
									step: trigger.ask.slice(0, 60),
									sig: trigger.requires,
									family: trigger.requires.split(":")[0],
								}));
								source = "trigger checklist";
							}
						}
					}
					if (rows.length === 0) {
						ctx.ui.notify(
							"capability-router: nothing to switch on — no plan, and neither the task text nor the trigger checklist names a capability.",
							"warning",
						);
						return;
					}
					conformance.rows = rows;
					conformance.mentionedAt = new Map();
					conformance.mentions = new Map();
					conformance.spoken = 0;
					idleNoticeSent = true;
					updateStatus(ctx);
					pi.appendEntry("capability-router/adopted", { source, rows: rows.map((row) => row.sig) });
					ctx.ui.notify(
						`capability-router: on (from ${source}) — ${rows.length} capabilities now checked:\n${rows.map((row) => `  - ${row.sig}`).join("\n")}`,
						"info",
					);
					return;
				}
				if (sub === "review" || sub === "recommend") {
					// The plan-review path, on demand: it never ran on plan_complete in sessions where the
					// plan arrived as a message instead of a plan_mode_complete call.
					if (!index) rebuild();
					const branch = ctx.sessionManager.getBranch() as any;
					const plan = lastPlanFromBranch(branch);
					const source = plan ?? lastUserMessage(branch);
					if (!source) {
						ctx.ui.notify("capability-router: nothing to review — no plan and no task message.", "warning");
						return;
					}
					const rows = deriveRows(source);
					const classifier = ctx.modelRegistry.getModelOfType("classifier", judge.provider, judge.model) as never;
					if (!classifier) {
						ctx.ui.notify("capability-router: classifier not registered — cannot review.", "warning");
						return;
					}
					const probabilities = await askTriggers(ctx, classifier, source, judge.timeoutMs).catch(() => ({}));
					const rejected = parseRejections(source);
					const coverage = coverageFindings(probabilities, rows, undefined, undefined, rejected);
					const required = new Set(
						TRIGGERS.filter((trigger) => (probabilities[trigger.id] ?? 0) >= TRIGGER_THRESHOLD).map((trigger) => trigger.requires),
					);
					const judged = new Map<number, StepJudgement>();
					await Promise.all(
						rows.slice(0, 6).map(async (row, position) => {
							const outcome = await decide(row.step, capabilities, index!, ctx, judge);
							const top = outcome.picks[0];
							if (top) judged.set(position, { id: top.capability.id, probability: top.probability });
						}),
					);
					const list: Finding[] = [
						...mandatoryFindings(rows, rejected),
						...coverage,
						...findings(
							rows.map((row, position) => ({ index: position, text: row.step })),
							rows,
							judged,
							index!,
							capabilities,
							{ max: 6, required },
						),
					].slice(0, 8);
					if (list.length === 0) {
						ctx.ui.notify(
							`capability-router: review clean — ${rows.length} capabilities checked against ${Object.values(probabilities).filter((p) => p >= TRIGGER_THRESHOLD).length} fired triggers.`,
							"info",
						);
						return;
					}
					const text = renderFindings(list, { submit: false });
					const alsoKick = ((args ?? "").trim().split(/\s+/)[1] ?? "") === "kick";
					pi.appendEntry("capability-router/plan-review", { findings: list.length, rows: rows.length, manual: true });
					if (alsoKick) {
						pi.sendMessage({ customType: "capability-router/plan-review", content: text, display: true }, { deliverAs: "steer" });
						ctx.ui.notify(`capability-router: review sent to the model (${list.length} findings).`, "info");
					} else {
						ctx.ui.notify(`${text}\n\n(send it with /router review kick)`, "info");
					}
					return;
				}

				if (sub === "check" || sub === "kick") {
					const unused = unsatisfiedRows(conformance);
					if (unused.length === 0) {
						ctx.ui.notify(`capability-router: nothing unused${conformance.rows.length === 0 ? " (no plan rows — run /router on)" : ""}.`, "info");
						return;
					}
					const families = ["manual"];
					const text = renderCorrections(unused, families);
					if (sub === "check") {
						ctx.ui.notify(`would send to the model:\n${text}`, "info");
						return;
					}
					markMentioned(conformance, unused);
					pi.sendMessage({ customType: "capability-router/conformance", content: text, display: true }, { deliverAs: "steer" });
					ctx.ui.notify(`capability-router: sent ${unused.length} unused capabilities to the model.`, "info");
					return;
				}
				lines.push(
					renderStatus({
						state: conformance,
						judge: `${judge.provider}/${judge.model}`,
						capabilities: capabilities.length,
						blocked: blockedRows,
						reviewRounds,
					}),
					"",
					"commands: /router on — harvest rows from the last plan; /router check — show what it would say; /router kick — send it now.",
				);
				ctx.ui.notify(lines.join("\n"), "info");
			} catch (error) {
				ctx.ui.notify(`capability-router: ${String(error)}`, "warning");
			}
		},
	});

	pi.registerCommand("capabilities", {
		description: "Capability inventory, router status, coverage report. Subcommands: status, report [--days N], efficacy [--days N] [--window K], --names/--kind/--query",
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
				if (argv[0] === "status") {
					if (!index) rebuild();
					const text = renderStatus({
						state: conformance,
						judge: `${judge.provider}/${judge.model}`,
						capabilities: capabilities.length,
						blocked: blockedRows,
						reviewRounds,
					});
					ctx.ui.notify(`${text}\n\n${session}`, "info");
					return;
				}
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
				if (argv[0] === "efficacy") {
					// The number every nudge change is judged against: shown here, used within K calls after.
					const window = flagValue(argv, "--window", 20);
					if (!index) rebuild();
					const efficacy = await efficacyFor(EXTENSION_DIR, days, window, index?.mcpServers ?? []);
					writeJson(join(EXTENSION_DIR, `efficacy-${efficacy.days}d.json`), efficacy);
					ctx.ui.notify(formatEfficacy(efficacy), "info");
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