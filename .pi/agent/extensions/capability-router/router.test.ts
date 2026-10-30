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
import { familyOf, isPlanModeActive, lastPlanFromBranch, MAX_LINES, newState, nextCorrection, parseDeclaredRows, planHash, satisfiedBy, SILENCE_MS, workFamilies } from "./conformance.ts";
import { extractSteps, findings, MAX_REVIEW_ROUNDS, pairRows, parseRejections, renderFindings, signatureExists } from "./plan-review.ts";
import { buildTriggerQuestions, coverageFindings, coversSignature, MANDATORY, mandatoryFindings, TRIGGERS, TRIGGER_THRESHOLD } from "./triggers.ts";
import { isNoneAnswer, parseWorkstreams } from "./planner.ts";

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
			"skill:find-security-vulnerabilities-in-code": 0.206,
			"skill:improve": 0.1,
			"agent:security-appsec-engineer": 0.485,
			"skill:security-and-hardening": 0.056,
			none: 0.005,
		});
		expect(picked.length).toBeGreaterThanOrEqual(4);
		expect(picked[0]).toBe("agent:security-ai-generated-code-auditor");
		expect(picked).toContain("skill:improve");
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

	test("keeps a plausible tail but drops noise", () => {
		const picked = ids({
			"agent:engineering-database-optimizer": 0.62,
			"agent:engineering-backend-architect": 0.5,
			"mcp:serena": 0.1,
			"mcp:notion": MIN_PROBABILITY - 0.01,
			none: 0.013,
		});
		expect(picked).toEqual(["agent:engineering-database-optimizer", "agent:engineering-backend-architect", "mcp:serena"]);
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
		expect(index.skills.length).toBeGreaterThan(55);
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
		expect(familyOf("mcp", { server: "playwright" })).toBe("mcp:playwright");
		expect(familyOf("subagent", { agent: "reviewer" })).toBe("subagent");
		expect(familyOf("read", { path: "/home/m/.pi/agent/skills/ponytail/SKILL.md" })).toBe("skill:ponytail");
		expect(familyOf("bash", { command: "ls" })).toBe("bash");
	});

	test("a declared mcp tool is not satisfied by another tool on the same server", () => {
		const row = { step: "map callers", sig: "mcp:codebase-memory-mcp/trace_path", family: "mcp" };
		expect(familyOf("mcp", { server: "codebase-memory-mcp", tool: "index_status" })).toBe("mcp:codebase-memory-mcp/index_status");
		expect(satisfiedBy(row, ["mcp:codebase-memory-mcp/index_status"])).toBe(false);
		expect(satisfiedBy(row, ["mcp:codebase-memory-mcp/trace_path"])).toBe(true);
		// a row without a tool still accepts any tool of that server
		expect(satisfiedBy({ ...row, sig: "mcp:codebase-memory-mcp" }, ["mcp:codebase-memory-mcp/index_status"])).toBe(true);
	});

	test("a declared mcp tool is satisfied by that tool on that server only", () => {
		const row = parseDeclaredRows(plan)[0];
		expect(satisfiedBy(row, ["mcp:serena/rename_symbol"])).toBe(true);
		expect(satisfiedBy(row, ["mcp:serena"])).toBe(false);
		expect(satisfiedBy(row, ["mcp:serena/safe_delete_symbol"])).toBe(false);
		expect(satisfiedBy(row, ["mcp:playwright/rename_symbol"])).toBe(false);
		expect(satisfiedBy(parseDeclaredRows(plan)[1], ["subagent"])).toBe(true);
	});

	test("speaks when primitives stand in for a declared capability", () => {
		const state = newState();
		state.rows = parseDeclaredRows(plan);
		const correction = nextCorrection({ state, turnFamilies: ["bash", "read"], now: 1_000_000 });
		expect(correction?.row.sig).toBe("mcp:serena/rename_symbol");
		expect(correction?.text).toContain("still unused");
		expect(correction?.text).toContain("bash, read");
	});

	test("stays silent with no plan, no work, or satisfied rows", () => {
		const empty = newState();
		expect(nextCorrection({ state: empty, turnFamilies: ["bash"], now: 1 })).toBeNull();

		const state = newState();
		state.rows = parseDeclaredRows(plan);
		expect(nextCorrection({ state, turnFamilies: [], now: 1 })).toBeNull();

		state.observed = new Set(["mcp:serena", "subagent", "read"]);
		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 1 })).toBeNull();
	});

	test("noise budget: one line per row, three per session, two minutes apart", () => {
		const state = newState();
		state.rows = parseDeclaredRows(plan);
		const first = nextCorrection({ state, turnFamilies: ["bash"], now: 1_000_000 });
		expect(first).not.toBeNull();
		state.reminded.add(first!.row.step);
		state.spoken += 1;
		state.lastSpoke = 1_000_000;

		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 1_000_000 + SILENCE_MS - 1 })).toBeNull();
		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 1_000_000 + SILENCE_MS })).not.toBeNull();

		state.spoken = MAX_LINES;
		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 9_000_000 })).toBeNull();
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
		expect(nextCorrection({ state, turnFamilies: ["plan_mode_complete"], now: 1_000_000 })).toBeNull();
	});

	test("A1: meta tools are stripped from the reported turn", () => {
		const state = newState();
		state.rows = rows;
		const correction = nextCorrection({ state, turnFamilies: ["plan_mode_complete", "bash"], now: 1_000_000 });
		expect(correction).not.toBeNull();
		expect(correction?.text).toContain("bash");
		expect(correction?.text).not.toContain("plan_mode_complete");
	});

	test("A2: the same plan hashes the same, whitespace differences included", () => {
		expect(planHash("a b\nc")).toBe(planHash("a   b c"));
		expect(planHash("plan one")).not.toBe(planHash("plan two"));
	});

	test("A3: a declared skill is never enforced, because a skill is a process, not a call", () => {
		const state = newState();
		state.rows = [rows[0]]; // only the skill:ponytail row
		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 9_000_000 })).toBeNull();
		expect(nextCorrection({ state, turnFamilies: ["bash"], now: 9_000_000, satisfiedSkills: new Set(["ponytail"]) })).toBeNull();
		// a capability row next to it is still enforced
		const withMcp = newState();
		withMcp.rows = rows;
		expect(nextCorrection({ state: withMcp, turnFamilies: ["bash"], now: 9_000_000 })?.row.sig).toBe("mcp:serena/rename_symbol");
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
