/**
 * Pure-function tests, no Pi runtime and no network: `bun test capability-router/router.test.ts`.
 *
 * The gate tests use the probability distributions measured from real Clef responses, so a threshold
 * change that would start hinting on "make it better" fails here first.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCapabilities, buildIndex, renderCapabilitySection } from "./indexer.ts";
import { buildQuestion, MAX_HINTS, MIN_PROBABILITY, MIN_TOP, NONE_FLOOR, RELATIVE_FLOOR, select } from "./judge.ts";
import { HINT_MAX_CHARS, matchedBy, renderHint, toSuggestion, type RouteMap } from "./router.ts";
import { detectManifest, formatBrief } from "./context.ts";
import { alreadyUsed, deriveRows, familyOf, harvestSignatures, setKnownServers, isPlanModeActive, lastUserMessage, isDue, lastPlanFromBranch, markMentioned, MAX_MENTIONS_PER_ROW, newState, parseDeclaredRows, pendingCorrections, planHash, REASSERT_AFTER_TURNS, renderCorrections, renderStatus, satisfiedBy, workFamilies } from "./conformance.ts";
import { extractSteps, findings, MAX_REVIEW_ROUNDS, pairRows, parseRejections, renderFindings, signatureExists } from "./plan-review.ts";
import { buildTriggerQuestions, coverageFindings, coversSignature, MANDATORY, mandatoryFindings, TRIGGERS, TRIGGER_THRESHOLD } from "./triggers.ts";
import { cbmIndexPath, probeCapability } from "./availability.ts";
import { isNoneAnswer, parseWorkstreams } from "./planner.ts";
import { CLASSIFY_INTERVAL_MS, classifyDue, detect, renderDetection } from "./detect.ts";
import { parseVerdict, renderCatalog, renderUser } from "./watch.ts";
import { formatEfficacy, normalizeSig, parseCallLine, parseShown, sessionIdFromPath, summarize, usedWithin, windowFor } from "./efficacy.ts";

const DIR = import.meta.dir;
const map = JSON.parse(readFileSync(join(DIR, "map.json"), "utf8")) as RouteMap;
const index = buildIndex(join(process.env.HOME ?? "", ".pi", "agent"));
const capabilities = buildCapabilities(index, map);

const choice = (id: string, probabilities: Record<string, number>) => ({
	pick: { type: "choice", choice: id, probabilities },
});

describe("question over the whole inventory", () => {
	test("every capability is offered, plus none", () => {
		const question = buildQuestion(capabilities);
		expect(Object.keys(question.criteria).length).toBe(capabilities.length + 1);
		expect(question.criteria.none).toBeDefined();
		expect(question.criteria["agent:engineering-code-reviewer"]).toContain("agent engineering-code-reviewer:");
	});

	test("criteria stay short enough to keep the request cheap", () => {
		const question = buildQuestion(capabilities);
		const longest = Math.max(...Object.values(question.criteria).map((text) => text.length));
		expect(longest).toBeLessThanOrEqual(121);
	});
});

describe("selection: how many capabilities fit", () => {
	const ids = (probabilities: Record<string, number>) => select(choice("", probabilities), capabilities).ids;

	test("a focused task gets one (accessibility 0.927)", () => {
		expect(ids({ "agent:testing-accessibility-auditor": 0.927, "agent:engineering-frontend-developer": 0.005, none: 0.001 })).toEqual([
			"agent:testing-accessibility-auditor",
		]);
	});

	test("a multi-part task gets several, most likely first", () => {
		const picked = ids({
			"agent:security-ai-generated-code-auditor": 0.513,
			// was find-security-vulnerabilities-in-code (0.206), removed with the strix uninstall
			"skill:security-threat-model": 0.206,
			"skill:improve": 0.1,
			"agent:security-appsec-engineer": 0.485,
			"skill:security-and-hardening": 0.056,
			none: 0.005,
		});
		expect(picked).toEqual(["agent:security-ai-generated-code-auditor", "agent:security-appsec-engineer"]);
		// Ordering still wins over volume: the two strongest survive the cap, the rest are dropped.
		expect(picked[0]).toBe("agent:security-ai-generated-code-auditor");
	});

	test("an agent below the delegation bar is dropped, mcp and skills are not", () => {
		const picked = ids({
			"agent:engineering-database-optimizer": 0.44,
			"mcp:serena": 0.3,
			"skill:test-driven-development": 0.25,
			none: 0.01,
		});
		expect(picked).not.toContain("agent:engineering-database-optimizer");
		expect(picked).toEqual(["mcp:serena", "skill:test-driven-development"]);
	});

	test("caps the list so the hint stays a nudge, not a menu", () => {
		const flat: Record<string, number> = { none: 0.001 };
		capabilities.filter((c) => c.kind !== "agent").slice(0, 20).forEach((capability, index) => (flat[capability.id] = 0.2 - index * 0.001));
		expect(ids(flat).length).toBe(MAX_HINTS);
	});

	test("silences when none wins (2+2: 0.929)", () => {
		expect(ids({ none: 0.929, "skill:find-skills": 0.002 })).toEqual([]);
	});

	test("silences below the top floor and above the none floor", () => {
		expect(ids({ "agent:engineering-sre": MIN_TOP - 0.01, none: 0.01 })).toEqual([]);
		expect(ids({ "agent:engineering-sre": 0.5, none: NONE_FLOOR })).toEqual([]);
	});

	test("keeps the two strongest, drops everything below them", () => {
		const picked = ids({
			"agent:engineering-database-optimizer": 0.62,
			"agent:engineering-backend-architect": 0.5,
			"mcp:serena": 0.1,
			"mcp:notion": MIN_PROBABILITY - 0.01,
			none: 0.013,
		});
		expect(picked).toEqual(["agent:engineering-database-optimizer", "agent:engineering-backend-architect"]);
	});

	test("flat distribution: relative floor does the work", () => {
		const picked = ids({ "skill:improve": 0.415, "skill:impeccable": 0.161, "skill:interface-design": 0.05, none: 0.024 });
		expect(picked).toEqual(["skill:improve", "skill:impeccable"]);
		expect(RELATIVE_FLOOR * 0.415).toBeLessThan(0.161);
	});

	test("unknown options and malformed answers are ignored", () => {
		expect(ids({ "agent:invented": 0.9, none: 0.01 })).toEqual([]);
		expect(select(undefined, capabilities).ids).toEqual([]);
		expect(select({ pick: { type: "score" } }, capabilities).ids).toEqual([]);
	});
});

describe("hint and usage matcher", () => {
	const suggestion = toSuggestion(capabilities.find((capability) => capability.id === "agent:engineering-database-optimizer")!);

	test("single hint names the exact call", () => {
		const hint = renderHint([suggestion]);
		expect(hint.split("\n")[0]).toContain("agent engineering-database-optimizer fits this task");
		expect(hint).toContain('subagent({agent:"engineering-database-optimizer"');
	});

	test("multi hint lists one line per capability, within budget", () => {
		const hint = renderHint([suggestion, suggestion, suggestion, suggestion]);
		expect(hint.split("\n").length).toBe(5);
		expect(hint.split("\n")[0]).toContain("4 capabilities fit this task");
		expect(hint.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
	});

	test("long descriptions are shortened, never dropped", () => {
		const long = { ...suggestion, why: "x".repeat(900) };
		const hint = renderHint([long]);
		expect(hint.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
		expect(hint).toContain("subagent(");
	});

	test("no suggestions renders nothing", () => {
		expect(renderHint([])).toBe("");
	});

	test("usage matcher follows each suggestion kind", () => {
		expect(matchedBy("subagent", { agent: "engineering-database-optimizer" }, suggestion)).toBe(true);
		expect(matchedBy("subagent", { agent: "other" }, suggestion)).toBe(false);
		expect(matchedBy("mcp", { server: "serena" }, { ...suggestion, kind: "mcp", name: "serena" })).toBe(true);
		expect(matchedBy("mcp__serena", {}, { ...suggestion, kind: "mcp", name: "serena" })).toBe(true);
		expect(matchedBy("mcp__codebase_memory_mcp", {}, { ...suggestion, kind: "mcp", name: "codebase-memory-mcp" })).toBe(false);
		expect(matchedBy("read", { path: "/home/m/.pi/agent/skills/ponytail/SKILL.md" }, { ...suggestion, kind: "skill", name: "ponytail" })).toBe(true);
	});
});

describe("index", () => {
	test("finds the installed inventory, including package skills", () => {
		expect(index.agents.length).toBe(78);
		expect(index.prompts.length).toBe(2);
		expect(index.mcpServers.length).toBe(6);
		expect(index.skills.length).toBeGreaterThan(50);
		expect(index.skills).toContain("ponytail");
		expect(index.skills).toContain("test-driven-development");
		const packaged = index.skillEntries.filter((entry) => entry.source !== "user");
		expect(packaged.length).toBeGreaterThan(20);
		expect(packaged.every((entry) => entry.description.length > 0)).toBe(true);
	});

	test("every callable capability carries a real description from disk", () => {
		expect(capabilities.filter((capability) => capability.kind === "agent").length).toBe(78);
		expect(capabilities.filter((capability) => capability.kind === "skill").length).toBe(index.skills.length);
		const review = capabilities.find((capability) => capability.name === "engineering-code-reviewer");
		expect(review?.description.length).toBeGreaterThan(40);
		const skill = capabilities.find((capability) => capability.id === "skill:systematic-debugging");
		expect(skill?.description.length).toBeGreaterThan(20);
	});

	test("static system-prompt section fits the budget", () => {
		const section = renderCapabilitySection(index, map);
		expect(section.length).toBeLessThanOrEqual(3600);
		expect(section).toContain("78 agents installed");
		expect(section).toContain("codebase-memory-mcp");
	});
});

describe("planner", () => {
	test("parses plain lines and strips numbering or bullets", () => {
		expect(parseWorkstreams("1. review the Rust router changes\n- check the sqlx queries for injection\n* add authz tests")).toEqual([
			"review the Rust router changes",
			"check the sqlx queries for injection",
			"add authz tests",
		]);
	});

	test("drops prose preamble, duplicates and junk", () => {
		expect(parseWorkstreams("Here are the workstreams:\nfix the login bug\nfix the login bug\nok")).toEqual(["fix the login bug"]);
	});

	test("caps the list and keeps order", () => {
		const parsed = parseWorkstreams("one task here\ntwo task here\nthree task here\nfour task here", 3);
		expect(parsed).toEqual(["one task here", "two task here", "three task here"]);
	});

	test("single-workstream tasks stay single", () => {
		expect(parseWorkstreams("make the dashboard faster")).toEqual(["make the dashboard faster"]);
	});

	test("empty or noisy output yields nothing, so the caller falls back", () => {
		expect(parseWorkstreams("")).toEqual([]);
		expect(parseWorkstreams("   \n\n  ")).toEqual([]);
	});

	test("recognises the planner's opt-out for non-project tasks", () => {
		expect(isNoneAnswer("none")).toBe(true);
		expect(isNoneAnswer(" none. ")).toBe(true);
		expect(isNoneAnswer("None of the workstreams")).toBe(false);
		expect(isNoneAnswer("review the router")).toBe(false);
	});
});

describe("project context", () => {
	test("detects language from the manifest, first match wins", () => {
		expect(detectManifest(["src", "Cargo.toml", "package.json"])).toEqual({ language: "rust", manifest: "Cargo.toml" });
		expect(detectManifest(["pyproject.toml"])).toEqual({ language: "python", manifest: "pyproject.toml" });
		expect(detectManifest(["src", "README.md"])).toBeNull();
	});

	test("brief is text, not JSON, and omits empty sections", () => {
		const brief = formatBrief({ cwd: "/x", language: "rust", manifest: "Cargo.toml", framework: "tokio, axum", tree: ["src/", "tests/"], changed: ["src/router.rs"] });
		expect(brief).toContain("project: rust (Cargo.toml), tokio, axum");
		expect(brief).toContain("tree: src/, tests/");
		expect(brief).toContain("changed: src/router.rs");
		expect(formatBrief({ cwd: "/x", tree: [], changed: [] })).toBe("project: unknown");
	});
});

describe("conformance", () => {
	const plan = [
		"# Plan",
		"| Key | Value | Why |",
		"| --- | --- | --- |",
		"| theme | `--primary` | brand |",
		"## Capabilities",
		"| Step | Capability | Why |",
		"| --- | --- | --- |",
		"| rename helper | `mcp:serena/rename_symbol` | LSP rename |",
		"| verify | `subagent:reviewer` | blackbox |",
		"| read config | `read` | one file |",
		"## Risks",
		"| row | `nonsense` | later table |",
	].join("\n");

	test("parses only the Capabilities section, not other tables", () => {
		const rows = parseDeclaredRows(plan);
		expect(rows.map((row) => row.sig)).toEqual(["mcp:serena/rename_symbol", "subagent:reviewer", "read"]);
		expect(rows[0].step).toBe("rename helper");
	});

	test("maps tool calls to families", () => {
		expect(familyOf("mcp__serena", {})).toBe("mcp:serena");
		expect(familyOf("mcp__codebase_memory_mcp", {})).toBe("mcp:codebase-memory-mcp");
		// A bare server call lists its tools; it invokes nothing. Measured on a real run: counting it as
		// use made serena look "already used" and silently suppressed the nudge naming it.
		expect(familyOf("mcp", { server: "playwright" })).toBe("mcp:lookup");
		expect(familyOf("subagent", { agent: "reviewer" })).toBe("subagent:reviewer");
		expect(familyOf("read", { path: "/home/m/.pi/agent/skills/ponytail/SKILL.md" })).toBe("skill:ponytail");
		expect(familyOf("bash", { command: "ls" })).toBe("bash");
	});

	test("a declared mcp tool is satisfied by that tool on that server only", () => {
		const row = parseDeclaredRows(plan)[0];
		expect(satisfiedBy(row, ["mcp:serena/rename_symbol"])).toBe(true);
		expect(satisfiedBy(row, ["mcp:serena"])).toBe(false);
		expect(satisfiedBy(row, ["mcp:serena/safe_delete_symbol"])).toBe(false);
		expect(satisfiedBy(row, ["mcp:playwright/rename_symbol"])).toBe(false);
		expect(satisfiedBy(parseDeclaredRows(plan)[1], ["subagent:reviewer"])).toBe(true);
		expect(satisfiedBy(parseDeclaredRows(plan)[1], ["subagent:engineering-code-reviewer"])).toBe(false);
	});

	test("a turn that mixed another capability with primitives still reports the unused rows", () => {
		const state = newState();
		state.rows = parseDeclaredRows(plan);
		const pending = pendingCorrections({ state, turnFamilies: ["mcp:playwright", "bash"] });
		expect(pending.map((row) => row.sig)).toEqual(["mcp:serena/rename_symbol", "subagent:reviewer"]);
	});

	test("lists every bypassed capability at once, not one per turn", () => {
		const state = newState();
		state.rows = parseDeclaredRows(plan);
		const pending = pendingCorrections({ state, turnFamilies: ["bash", "read"] });
		expect(pending.map((row) => row.sig)).toEqual(["mcp:serena/rename_symbol", "subagent:reviewer"]);
		const text = renderCorrections(pending, ["bash", "read"]);
		expect(text).toContain("2 declared capabilities are unused");
		expect(text).toContain("mcp:serena/rename_symbol");
		expect(text).toContain("subagent:reviewer");
	});

	test("no session cap: ten unused rows are all reported", () => {
		const state = newState();
		state.rows = Array.from({ length: 10 }, (_, i) => ({ step: `s${i}`, sig: `mcp:serena/tool${i}`, family: "mcp" }));
		const pending = pendingCorrections({ state, turnFamilies: ["bash"] });
		expect(pending).toHaveLength(10);
		expect(renderCorrections(pending, ["bash"]).split("\n")[0]).toContain("10 declared capabilities");
	});

	test("stays silent with no plan, no work, or satisfied rows", () => {
		const empty = newState();
		expect(pendingCorrections({ state: empty, turnFamilies: ["bash"] })).toEqual([]);

		const state = newState();
		state.rows = parseDeclaredRows(plan);
		expect(pendingCorrections({ state, turnFamilies: [] })).toEqual([]);

		state.observed = new Set(["mcp:serena/rename_symbol", "subagent:reviewer", "read"]);
		expect(pendingCorrections({ state, turnFamilies: ["bash"] })).toEqual([]);
	});

	test("each row is asked once", () => {
		const state = newState();
		state.rows = parseDeclaredRows(plan);
		const first = pendingCorrections({ state, turnFamilies: ["bash"] });
		markMentioned(state, first);
		expect(pendingCorrections({ state, turnFamilies: ["bash"] })).toEqual([]);
	});
});

describe("plan review", () => {
	const plan = [
		"## Capabilities",
		"| Step | Capability | Why |",
		"| --- | --- | --- |",
		"| Design the table | `skill:supabase-postgres-best-practices` | repo uses PG |",
		"| Create the branch | `bash` | git |",
		"| Map call sites | `mcp:codebase-memory-mcp/trace_path` | multi-hop |",
	].join("\n");

	test("steps come from the plan's own table", () => {
		expect(extractSteps(plan).map((step) => step.text)).toEqual(["Design the table", "Create the branch", "Map call sites"]);
	});

	test("falls back to headings when there is no table", () => {
		const prose = "# Plan\n\n### 1. Create the branch from dev\n\n### 2. Add the pagination hook\n\n## Risks\n";
		expect(extractSteps(prose).map((step) => step.text)).toEqual(["Create the branch from dev", "Add the pagination hook"]);
	});

	test("unknown mcp servers are flagged, project-local skills are not", () => {
		expect(signatureExists("mcp:codebase-memory-mcp/trace_path", index)).toBe(true);
		expect(signatureExists("mcp:not-installed/tool", index)).toBe(false);
		expect(signatureExists("skill:openspec-propose", index)).toBe(true);
		expect(signatureExists("subagent:reviewer", index)).toBe(true);
		expect(signatureExists("bash", index)).toBe(true);
	});

	test("reports a capability replaced by a better one of the same kind", () => {
		const rows = parseDeclaredRows(plan);
		const judged = new Map([
			[0, { id: "skill:api-design-principles", probability: 0.6 }],
			[2, { id: "mcp:codebase-memory-mcp", probability: 0.8 }],
		]);
		const list = findings(extractSteps(plan), rows, judged, index, capabilities);
		expect(list).toHaveLength(1);
		expect(list[0].kind).toBe("better-fit");
		expect(list[0].declared).toBe("skill:supabase-postgres-best-practices");
		expect(list[0].suggested?.sig).toBe("skill:api-design-principles");
	});

	test("never nags about a primitive row", () => {
		const rows = parseDeclaredRows(plan);
		const judged = new Map([[1, { id: "agent:engineering-git-workflow-master", probability: 0.9 }]]);
		expect(findings(extractSteps(plan), rows, judged, index, capabilities)).toHaveLength(0);
	});

	test("only speaks above the confidence floor", () => {
		const rows = parseDeclaredRows(plan);
		const judged = new Map([[0, { id: "agent:engineering-database-optimizer", probability: 0.2 }]]);
		expect(findings(extractSteps(plan), rows, judged, index, capabilities)).toHaveLength(0);
	});

	test("the message asks for a re-submission, not a silent edit", () => {
		const rows = parseDeclaredRows(plan);
		const judged = new Map([[0, { id: "skill:api-design-principles", probability: 0.6 }]]);
		const text = renderFindings(findings(extractSteps(plan), rows, judged, index, capabilities));
		expect(text).toContain("Re-submit the plan");
		expect(text).toContain("plan_mode_complete again");
	});

	test("pairs rows to steps by index when counts match", () => {
		const rows = parseDeclaredRows(plan);
		const paired = pairRows(extractSteps(plan), rows);
		expect(paired.map((pair) => pair.row?.sig)).toEqual(rows.map((row) => row.sig));
	});
});

describe("noise defects found by the dry run", () => {
	const rows = parseDeclaredRows("## Capabilities\n| Step | Capability | Why |\n| --- | --- | --- |\n| scope it | `skill:ponytail` | before new code |\n| rename | `mcp:serena/rename_symbol` | LSP |");

	test("A1: a plan-only turn is not work, so nothing is reported", () => {
		const state = newState();
		state.rows = rows;
		expect(workFamilies(["plan_mode_complete", "todo", "bg_run"])).toEqual([]);
		expect(pendingCorrections({ state, turnFamilies: ["plan_mode_complete"] })).toEqual([]);
	});

	test("A1: meta tools are stripped from the reported turn", () => {
		const state = newState();
		state.rows = rows;
		const pending = pendingCorrections({ state, turnFamilies: ["plan_mode_complete", "bash"] });
		expect(pending).toHaveLength(1);
		const text = renderCorrections(pending, ["plan_mode_complete", "bash"]);
		expect(text).toContain("bash");
		expect(text).not.toContain("plan_mode_complete");
	});

	test("A2: the same plan hashes the same, whitespace differences included", () => {
		expect(planHash("a b\nc")).toBe(planHash("a   b c"));
		expect(planHash("plan one")).not.toBe(planHash("plan two"));
	});

	test("A3: a declared skill is never enforced, because a skill is a process, not a call", () => {
		const state = newState();
		state.rows = [rows[0]]; // only the skill:ponytail row
		expect(pendingCorrections({ state, turnFamilies: ["bash"] })).toEqual([]);
		// a capability row next to it is still enforced
		const withMcp = newState();
		withMcp.rows = rows;
		expect(pendingCorrections({ state: withMcp, turnFamilies: ["bash"] }).map((row) => row.sig)).toEqual(["mcp:serena/rename_symbol"]);
	});

	test("A4: the last submitted plan is recovered from the transcript", () => {
		const branch = [
			{ type: "message", message: { content: [{ type: "text", text: "hi" }] } },
			{ type: "message", message: { content: [{ type: "toolCall", name: "plan_mode_complete", arguments: { plan: "## Capabilities\n| Step | Capability | Why |\n| --- | --- | --- |\n| old | `bash` | x |" } }] } },
			{ type: "message", message: { content: [{ type: "toolCall", name: "plan_mode_complete", arguments: { plan: "## Capabilities\n| Step | Capability | Why |\n| --- | --- | --- |\n| new | `edit` | y |" } }] } },
		];
		const plan = lastPlanFromBranch(branch);
		expect(plan).toContain("| new |");
		expect(parseDeclaredRows(plan!)[0].step).toBe("new");
		expect(lastPlanFromBranch([])).toBeNull();
	});
});

describe("plan mode", () => {
	test("reads the state from the session, not from the prompt", () => {
		expect(isPlanModeActive([{ type: "custom", customType: "plan-mode-state", data: { enabled: true } }])).toBe(true);
		expect(isPlanModeActive([{ type: "custom", customType: "plan-mode-state", data: { enabled: false } }])).toBe(false);
		expect(isPlanModeActive([{ type: "custom", customType: "plan-mode-state", data: { enabled: true } }, { type: "custom", customType: "plan-mode-state", data: { enabled: false } }])).toBe(false);
		expect(isPlanModeActive([])).toBe(false);
		expect(isPlanModeActive([{ type: "message" }])).toBe(false);
	});
});

describe("trigger coverage", () => {
	const rows = parseDeclaredRows("## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| docs | `skill:find-docs` | look it up |");

	test("one closed question per trigger", () => {
		const questions = buildTriggerQuestions() as Record<string, { type: string }>;
		expect(Object.keys(questions).length).toBe(TRIGGERS.length);
		expect(Object.values(questions).every((question) => question.type === "noul")).toBe(true);
	});

	test("a fired trigger with no row is a finding", () => {
		const list = coverageFindings({ error_handling: 0.95 }, []);
		expect(list).toHaveLength(1);
		expect(list[0].kind).toBe("missing-capability");
		expect(list[0].suggested?.sig).toBe("skill:error-handling-patterns");
	});

	test("a declared row satisfies its trigger", () => {
		expect(coverageFindings({ runtime_api: 0.9 }, rows)).toEqual([]);
	});

	test("below the threshold nothing is reported", () => {
		expect(coverageFindings({ error_handling: TRIGGER_THRESHOLD - 0.01 }, [])).toEqual([]);
	});

	test("a rejection on the record is a documented deviation, not an omission", () => {
		expect(coverageFindings({ rename: 0.9 }, [], undefined, undefined, ["mcp:serena/rename_symbol"])).toEqual([]);
		expect(coverageFindings({ rename: 0.9 }, [], undefined, undefined, ["mcp:codebase-memory-mcp"])).toHaveLength(1);
	});

	test("reads the Rejected line from the plan", () => {
		const text = "## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| x | `skill:ponytail` | y |\n\nRejected: `mcp:serena/rename_symbol` — no tsconfig so no LSP; `subagent:reviewer` — small diff.\n\nNext section";
		expect(parseRejections(text)).toEqual(["mcp:serena/rename_symbol", "subagent:reviewer"]);
		expect(parseRejections("no rejections here")).toEqual([]);
	});

	test("an mcp trigger is satisfied by that tool, not another", () => {
		const trace = parseDeclaredRows("## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| callers | `mcp:codebase-memory-mcp/trace_path` | x |");
		expect(coverageFindings({ callers: 0.9 }, trace)).toEqual([]);
		const other = parseDeclaredRows("## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| callers | `mcp:codebase-memory-mcp/search_graph` | x |");
		expect(coverageFindings({ callers: 0.9 }, other)).toHaveLength(1);
	});
});

describe("the review cannot contradict the checklist", () => {
	const plan = "## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| scope | `skill:ponytail` | smallest diff |";
	const rows = parseDeclaredRows(plan);
	const steps = extractSteps(plan);
	const judged = new Map([[0, { id: "agent:engineering-minimal-change-engineer", probability: 0.86 }]]);

	test("a required capability is never told it has a better fit", () => {
		const list = findings(steps, rows, judged, index, capabilities, { required: new Set(["skill:ponytail"]) });
		expect(list).toEqual([]);
	});

	test("without the obligation, the same row is still compared", () => {
		const list = findings(steps, rows, judged, index, capabilities, {});
		expect(list).toEqual([]); // cross-kind comparison is refused anyway
	});

	test("a same-kind disagreement is still reported", () => {
		const sameKind = new Map([[0, { id: "skill:test-driven-development", probability: 0.9 }]]);
		const list = findings(steps, rows, sameKind, index, capabilities, {});
		expect(list).toHaveLength(1);
		expect(list[0].kind).toBe("better-fit");
	});

	test("review rounds are capped at two", () => {
		expect(MAX_REVIEW_ROUNDS).toBe(2);
	});
});

describe("mandatory trio", () => {
	const row = (sig: string) => parseDeclaredRows(`## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| x | \`${sig}\` | y |`);

	test("all three must be addressed", () => {
		expect(MANDATORY.map((m) => m.sig)).toEqual(["skill:ponytail", "mcp:serena", "mcp:codebase-memory-mcp"]);
		const missing = mandatoryFindings([], []);
		expect(missing).toHaveLength(3);
		expect(missing.map((f) => f.suggested?.sig)).toEqual(MANDATORY.map((m) => m.sig));
	});

	test("a row or a rejection each satisfy it", () => {
		const rows = [...row("skill:ponytail"), ...row("mcp:serena/find_symbol")];
		const missing = mandatoryFindings(rows, ["mcp:codebase-memory-mcp"]);
		expect(missing).toEqual([]);
	});

	test("an unrelated signature does not cover a mandatory one", () => {
		expect(coversSignature("mcp:serena", "mcp:playwright/navigate")).toBe(false);
		expect(coversSignature("mcp:serena", "mcp:serena/rename_symbol")).toBe(true);
		expect(coversSignature("skill:ponytail", "skill:ponytail-review")).toBe(false);
	});

	test("the review message names what is missing and how to fix it", () => {
		const text = renderFindings(mandatoryFindings([], []));
		expect(text).toContain("mandatory capability not addressed");
		expect(text).toContain("reject it on the record");
	});
});

describe("configuration preconditions", () => {
	const none = { which: () => false, exists: () => false };
	const all = { which: () => true, exists: () => true };

	test("serena is never blocked on a PATH guess (it spawns its own servers)", () => {
		expect(probeCapability("mcp:serena/replace_symbol_body", { ...none, language: "php" }).usable).toBe(true);
		expect(probeCapability("mcp:serena/replace_symbol_body", { ...all, language: "php" }).usable).toBe(true);
	});

	test("an unknown language is not guessed at", () => {
		expect(probeCapability("mcp:serena/x", { ...none }).usable).toBe(true);
		expect(probeCapability("mcp:serena/x", { ...none, language: "cobol" }).usable).toBe(true);
	});

	test("playwright without its browser binary is a configuration problem", () => {
		const result = probeCapability("mcp:playwright", { ...none, browserPath: "/nonexistent/chrome" });
		expect(result.usable).toBe(false);
		expect(result.fix).toContain("playwright install");
		expect(probeCapability("mcp:playwright", { ...all, browserPath: "/x/chrome" }).usable).toBe(true);
	});

	test("codebase-memory-mcp is blocked when the project has no index file", () => {
		const db = "/home/u/.cache/codebase-memory-mcp/home-u-proj.db";
		const blocked = probeCapability("mcp:codebase-memory-mcp/trace_path", { ...none, cbmDbPath: db });
		expect(blocked.usable).toBe(false);
		expect(blocked.reason).toContain("not indexed");
		expect(probeCapability("mcp:codebase-memory-mcp/trace_path", { ...all, cbmDbPath: db }).usable).toBe(true);
	});

	test("the index path follows the project slug", () => {
		expect(cbmIndexPath("/home/miguel/Documents/coloso-v2", "/cache")).toBe("/cache/home-miguel-Documents-coloso-v2.db");
		expect(cbmIndexPath("/home/miguel/Documents/ba-lxp-safety45", "/cache")).toBe("/cache/home-miguel-Documents-ba-lxp-safety45.db");
	});
});

describe("re-assertion and status", () => {
	const rows = parseDeclaredRows("## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| a | `mcp:serena/rename_symbol` | x |");

	test("a mentioned row comes back after the gap, up to the cap", () => {
		const state = newState();
		state.rows = rows;
		const row = rows[0];
		markMentioned(state, [row]);
		expect(isDue(state, row)).toBe(false);
		state.turn = REASSERT_AFTER_TURNS - 1;
		expect(isDue(state, row)).toBe(false);
		state.turn = REASSERT_AFTER_TURNS;
		expect(isDue(state, row)).toBe(true);
		for (let i = 0; i < MAX_MENTIONS_PER_ROW; i++) markMentioned(state, [row]);
		state.turn = 999;
		expect(isDue(state, row)).toBe(false);
	});

	test("mentions reset when the capability is actually used", () => {
		const state = newState();
		state.rows = rows;
		markMentioned(state, [rows[0]]);
		state.observed = new Set(["mcp:serena/rename_symbol"]);
		expect(pendingCorrections({ state, turnFamilies: ["bash"] })).toEqual([]);
	});

	test("status says it is alive, what is unused, and what is blocked", () => {
		const state = newState();
		state.rows = rows;
		state.turn = 7;
		const text = renderStatus({ state, judge: "ollama-clef/clef:cloud", capabilities: 145, blocked: new Map([["mcp:codebase-memory-mcp/trace_path", "not indexed"]]), reviewRounds: 1 });
		expect(text).toContain("loaded and evaluating every turn");
		expect(text).toContain("145 capabilities");
		expect(text).toContain("turn: 7");
		expect(text).toContain("mcp:serena/rename_symbol — mentioned 0/3");
		expect(text).toContain("not indexed");
	});

	test("status distinguishes 'no plan' from 'nothing left to say'", () => {
		expect(renderStatus({ state: newState() })).toContain("no plan rows");
		const satisfied = newState();
		satisfied.rows = rows;
		satisfied.observed = new Set(["mcp:serena/rename_symbol"]);
		const text = renderStatus({ state: satisfied });
		expect(text).toContain("unused: 0 (none due right now)");
	});
});

describe("plans without a Capabilities section", () => {
	const prose = [
		"## Scope",
		"First I will use `mcp:serena/find_referencing_symbols` to trace the callers.",
		"Then `mcp:codebase-memory-mcp/trace_path` for the 3-hop chain, and `skill:ponytail` for scope.",
		"Same tool again: `mcp:serena/find_referencing_symbols` is not duplicated.",
	].join("\n");

	test("harvests signatures from prose when there is no table", () => {
		const rows = harvestSignatures(prose);
		expect(rows.map((row) => row.sig)).toEqual([
			"mcp:serena/find_referencing_symbols",
			"mcp:codebase-memory-mcp/trace_path",
			"skill:ponytail",
		]);
	});

	test("a real table still wins over harvesting", () => {
		const withTable = "## Capabilities\n| Covers | Capability | Why |\n| --- | --- | --- |\n| x | `mcp:serena/rename_symbol` | y |\n\nAlso mentions `skill:ponytail` in prose.";
		expect(deriveRows(withTable).map((row) => row.sig)).toEqual(["mcp:serena/rename_symbol"]);
	});

	test("a plan with no signatures yields no rows (nothing to check, and it says so)", () => {
		expect(deriveRows("# Plan\nRead the files and fix the bug.")).toEqual([]);
	});
});

describe("finding the task when there is no plan", () => {
	const entries = (messages: string[]) => messages.map((text) => ({ type: "message", message: { role: "user", content: text } }));

	test("skips slash commands and returns the last real task", () => {
		expect(lastUserMessage(entries(["implement the sweep", "/router on"]) as any)).toBe("implement the sweep");
		expect(lastUserMessage(entries(["/router on"]) as any)).toBeNull();
		expect(lastUserMessage([])).toBeNull();
	});

	test("a multi-line prompt starting with a slash is not treated as a command", () => {
		expect(lastUserMessage(entries(["/kickoff\nthe real task text here"]) as any)).toContain("real task");
	});
});

describe("efficacy: shown vs used", () => {
	const calls = (families: string[]) => families.map((family, index) => ({ ts: 1_000 + index, family }));

	test("agent: rows are measured in the subagent vocabulary", () => {
		expect(normalizeSig("agent:reviewer")).toBe("subagent:reviewer");
		expect(normalizeSig("mcp:serena")).toBe("mcp:serena");
		expect(usedWithin(calls(["read", "subagent:reviewer"]), 999, "agent:reviewer", 5)).toBe(true);
	});

	test("a hit must come after the hint and inside the window", () => {
		expect(usedWithin(calls(["mcp:serena/find_symbol"]), 999, "mcp:serena", 5)).toBe(true);
		expect(usedWithin(calls(["read", "bash", "mcp:serena/find_symbol"]), 999, "mcp:serena", 2)).toBe(false);
		expect(usedWithin(calls(["mcp:codebase-memory-mcp/trace_path"]), 999, "mcp:serena", 5)).toBe(false);
	});

	test("a call before the hint does not count", () => {
		expect(usedWithin([{ ts: 500, family: "mcp:serena/index_status" }], 1_000, "mcp:serena", 5)).toBe(false);
	});

	test("a tool-level row wants that tool, a server row accepts any of them", () => {
		expect(usedWithin(calls(["mcp:serena/index_status"]), 999, "mcp:serena/rename_symbol", 5)).toBe(false);
		expect(usedWithin(calls(["mcp:serena/index_status"]), 999, "mcp:serena", 5)).toBe(true);
	});

	test("reading a SKILL.md is a skill use", () => {
		const line = JSON.stringify({
			timestamp: "2026-11-06T00:00:00.000Z",
			message: { content: [{ type: "toolCall", name: "read", arguments: { path: "/x/skills/find-docs/SKILL.md" } }] },
		});
		expect(parseCallLine(line).map((call) => call.family)).toEqual(["skill:find-docs"]);
	});

	test("non-call lines are skipped without parsing", () => {
		expect(parseCallLine('{"type":"message","message":{"role":"user"}}')).toEqual([]);
		expect(parseCallLine("not json")).toEqual([]);
	});

	test("all three usage schemas are read", () => {
		const ts = "2026-11-06T00:00:00.000Z";
		expect(parseShown(JSON.stringify({ ts, session: "s", picks: ["mcp:serena"] })).length).toBe(1);
		expect(parseShown(JSON.stringify({ ts, session: "s", suggested: ["skill:find-docs"] })).length).toBe(1);
		expect(parseShown(JSON.stringify({ ts, session: "s", target: "agent:reviewer" })).length).toBe(1);
		expect(parseShown(JSON.stringify({ ts, session: "s", picks: ["serena"] }))).toEqual([]);
		expect(parseShown(JSON.stringify({ session: "s", picks: ["mcp:serena"] }))).toEqual([]);
	});

	test("the session id comes out of the file name", () => {
		expect(sessionIdFromPath("/x/2026-11-06T12-28-48-409Z_01a1b0d5-4194-7157-9bdb-f09210f22465.jsonl")).toBe(
			"01a1b0d5-4194-7157-9bdb-f09210f22465",
		);
		expect(sessionIdFromPath("/x/notes.md")).toBeNull();
	});

	test("summarize counts per capability, busiest first", () => {
		const shown = [
			{ ts: 999, shownAt: 999, session: "a", sig: "mcp:serena" },
			{ ts: 999, shownAt: 999, session: "a", sig: "mcp:serena" },
			{ ts: 999, shownAt: 999, session: "b", sig: "skill:find-docs" },
		];
		const map = new Map([
			["a", calls(["mcp:serena/index_status"])],
			["b", calls(["bash", "bash"])],
		]);
		const rows = summarize(shown, map, 5);
		expect(rows[0]).toEqual({ sig: "mcp:serena", shown: 2, used: 2 });
		expect(rows[1]).toEqual({ sig: "skill:find-docs", shown: 1, used: 0 });
	});

	test("a legacy row is measured over the run it settles, not after its timestamp", () => {
		const sessionCalls = calls(["read", "mcp:serena/find_symbol", "bash"]);
		const legacy = { ts: 1_001, session: "a", sig: "mcp:serena" };
		expect(windowFor(legacy, -Infinity, sessionCalls, 5).map((call) => call.family)).toEqual(["read", "mcp:serena/find_symbol"]);
		expect(usedWithin(sessionCalls, legacy.ts, "mcp:serena", 5)).toBe(false);
	});

	test("the previous hint bounds a legacy window", () => {
		const sessionCalls = calls(["mcp:serena", "bash", "read"]);
		const current = { ts: 1_002, session: "a", sig: "skill:find-docs" };
		expect(windowFor(current, 1_000, sessionCalls, 5).map((call) => call.family)).toEqual(["bash", "read"]);
	});

	test("a report with nothing matched says so instead of 0%", () => {
		const text = formatEfficacy({
			days: 14,
			window: 20,
			sessions: 0,
			shown: 0,
			used: 0,
			pct: 0,
			basis: { exact: 0, run: 0 },
			rows: [],
			neverUsed: [],
		});
		expect(text).toContain("nothing to measure yet");
	});
});

describe("state detection: what the call itself implies", () => {
	test("a single-symbol grep is the case serena answers better", () => {
		const found = detect("grep", { pattern: "handleToolCall" });
		expect(found?.sig).toBe("mcp:serena");
		expect(found?.syntax).toContain('name_path_pattern:"handleToolCall"');
		expect(renderDetection(found!).length).toBeLessThan(320);
	});

	test("a regex or a phrase is not a symbol", () => {
		expect(detect("grep", { pattern: "handle.*Call" })).toBeNull();
		expect(detect("grep", { pattern: "tool call handling" })).toBeNull();
		expect(detect("grep", {})).toBeNull();
	});

	test("three reads in one session are a module scan", () => {
		expect(detect("read", { path: "/x/a.ts" }, 2)).toBeNull();
		expect(detect("read", { path: "/x/a.ts" }, 3)?.sig).toBe("mcp:codebase-memory-mcp");
	});

	test("anything else is silent", () => {
		expect(detect("bash", { command: "ls" }, 9)).toBeNull();
		expect(detect("write", { path: "/x/a.ts" }, 9)).toBeNull();
	});

	test("a very long pattern is treated as a regex, not a symbol", () => {
		expect(detect("grep", { pattern: "a".repeat(61) })).toBeNull();
	});
});

describe("bounded drift classifier", () => {
	const now = 1_000_000_000_000;
	const base = { inFlight: false, lastAt: now - CLASSIFY_INTERVAL_MS - 1, now, lastWork: "bash" };

	test("fires once the interval has passed and the work is manual", () => {
		expect(classifyDue(base)).toBe(true);
	});

	test("silent inside the interval", () => {
		expect(classifyDue({ ...base, lastAt: now - 1_000 })).toBe(false);
	});

	test("silent while a call is in flight", () => {
		expect(classifyDue({ ...base, inFlight: true })).toBe(false);
	});

	test("silent when the last step already used a capability", () => {
		expect(classifyDue({ ...base, lastWork: "mcp:serena/find_symbol" })).toBe(false);
		expect(classifyDue({ ...base, lastWork: "subagent:reviewer" })).toBe(false);
	});

	test("silent when nothing has run yet", () => {
		expect(classifyDue({ ...base, lastWork: "" })).toBe(false);
	});
});

describe("a nudge never names what already happened", () => {
	test("a skill the session already read is not suggested again", () => {
		expect(alreadyUsed("skill:systematic-debugging", new Set(["skill:systematic-debugging", "read"]))).toBe(true);
		expect(alreadyUsed("skill:test-driven-development", new Set(["skill:systematic-debugging"]))).toBe(false);
	});

	test("a server-level signature accepts any tool on that server", () => {
		expect(alreadyUsed("mcp:serena", ["mcp:serena/index_status"])).toBe(true);
		expect(alreadyUsed("mcp:serena", ["mcp:codebase-memory-mcp/get_architecture"])).toBe(false);
	});

	test("a tool-level signature wants that tool", () => {
		expect(alreadyUsed("mcp:serena/rename_symbol", ["mcp:serena/index_status"])).toBe(false);
	});

	test("nothing observed means nothing is used", () => {
		expect(alreadyUsed("mcp:serena", [])).toBe(false);
	});
});

describe("the gateway's two call shapes", () => {
	test("server in a field", () => {
		expect(familyOf("mcp", { server: "serena", tool: "find_symbol" })).toBe("mcp:serena/find_symbol");
		expect(familyOf("mcp", { server: "serena" })).toBe("mcp:lookup");
	});

	test("server prefixed onto the tool name", () => {
		setKnownServers(["serena", "codebase-memory-mcp", "playwright"]);
		expect(familyOf("mcp", { tool: "serena_find_symbol", args: {} })).toBe("mcp:serena/find_symbol");
		expect(familyOf("mcp", { tool: "codebase-memory-mcp_trace_path" })).toBe("mcp:codebase-memory-mcp/trace_path");
		expect(familyOf("mcp", { tool: "playwright_browser_navigate" })).toBe("mcp:playwright/browser_navigate");
	});

	test("a lookup is not a use", () => {
		setKnownServers(["serena", "codebase-memory-mcp"]);
		expect(familyOf("mcp", { describe: "codebase-memory-mcp_index_repository" })).toBe("mcp:lookup");
		expect(familyOf("mcp", { search: "initial_instructions", server: "serena" })).toBe("mcp:lookup");
	});

	test("an unknown prefix stays whole rather than inventing a server", () => {
		setKnownServers(["serena"]);
		expect(familyOf("mcp", { tool: "unknown_server_tool" })).toBe("mcp:unknown_server_tool");
	});
});

describe("the watching senior", () => {
	const known = new Set(["mcp:serena", "skill:find-docs"]);

	test("a valid verdict is an id plus an instruction", () => {
		expect(parseVerdict("mcp:serena | use find_symbol on FormData instead of that grep", known)).toEqual({
			sig: "mcp:serena",
			line: "use find_symbol on FormData instead of that grep",
		});
	});

	test("silence is silence", () => {
		expect(parseVerdict("SILENT", known)).toBeNull();
		expect(parseVerdict("  silent  \n", known)).toBeNull();
		expect(parseVerdict("", known)).toBeNull();
	});

	test("an invented id is dropped, not rendered", () => {
		expect(parseVerdict("mcp:nonexistent | do the thing", known)).toBeNull();
		expect(parseVerdict("serena | missing the prefix", known)).toBeNull();
	});

	test("an id with no instruction is dropped", () => {
		expect(parseVerdict("mcp:serena |", known)).toBeNull();
	});

	test("backticks and preamble are tolerated", () => {
		expect(parseVerdict("`skill:find-docs` | look up the Bun fetch API", known)?.sig).toBe("skill:find-docs");
	});

	test("the catalog leaves out agents and anything already used", () => {
		const caps = [
			{ id: "agent:reviewer", kind: "agent", name: "reviewer", description: "reviews", syntax: "" },
			{ id: "mcp:serena", kind: "mcp", name: "serena", description: "symbol tools", syntax: "" },
			{ id: "skill:find-docs", kind: "skill", name: "find-docs", description: "docs", syntax: "" },
		] as never[];
		const out = renderCatalog(caps, new Set(["skill:find-docs"]), 10);
		expect(out).toContain("mcp:serena");
		expect(out).not.toContain("find-docs");
		expect(out).not.toContain("reviewer");
	});

	test("the user message carries the actions in order", () => {
		const text = renderUser("fix the drift", ["bash bun test", "read src/money.ts"], "mcp:serena — symbols");
		expect(text.indexOf("1. bash bun test")).toBeLessThan(text.indexOf("2. read src/money.ts"));
		expect(text).toContain("Task: fix the drift");
	});
});

describe("listing a server's tools is not using them", () => {
	test("a bare server call is a lookup", () => {
		expect(familyOf("mcp", { server: "serena" })).toBe("mcp:lookup");
		expect(alreadyUsed("mcp:serena", ["mcp:lookup"])).toBe(false);
	});
});
