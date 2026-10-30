/**
 * Usage mining: is the installed inventory actually reachable and reached?
 *
 * Primary measure is coverage — which installed capabilities were ever used, and which were never
 * touched — not raw call counts. Secondary is tool health (failed results) and the router's own
 * suggested-vs-used log in usage.jsonl.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SessionStats {
	file: string;
	subagentCalls: number;
	agents: string[];
	mcpServers: string[];
	skills: string[];
	mcpCalls: number;
	toolResults: number;
	failedResults: number;
	userPrompts: number;
}

export interface Inventory {
	agents: string[];
	skills: string[];
	mcp: string[];
}

export interface Coverage {
	days: number;
	sessions: number;
	installed: Inventory;
	used: Inventory;
	never: Inventory;
	pct: { agents: number; skills: number; mcp: number };
	health: { toolResults: number; failedResults: number; failedPct: number; subagentCalls: number };
}

export const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

export function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

/** Server tool names use underscores: `mcp__codebase_memory_mcp` for `codebase-memory-mcp`. */
const fromToolName = (toolName: string) => toolName.slice("mcp__".length).replace(/_/g, "-");

/** One session file → capability usage. Lines are pre-filtered: tool results can be megabytes. */
export async function mineSession(file: string): Promise<SessionStats> {
	const stats: SessionStats = {
		file,
		subagentCalls: 0,
		agents: [],
		mcpServers: [],
		skills: [],
		mcpCalls: 0,
		toolResults: 0,
		failedResults: 0,
		userPrompts: 0,
	};
	const agents = new Set<string>();
	const servers = new Set<string>();
	const skills = new Set<string>();
	const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
	for await (const line of rl) {
		if (line.includes('"role":"toolResult"')) {
			stats.toolResults += 1;
			if (line.includes('"isError":true')) stats.failedResults += 1;
			continue;
		}
		if (line.includes('"role":"user"')) stats.userPrompts += 1;
		if (!line.includes('"type":"toolCall"')) continue;
		let entry: any;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		const content = entry?.message?.content;
		if (!Array.isArray(content)) continue;
		for (const block of content) {
			if (block?.type !== "toolCall" || typeof block.name !== "string") continue;
			const args = block.arguments ?? {};
			if (block.name === "subagent") {
				stats.subagentCalls += 1;
				if (typeof args.agent === "string") agents.add(args.agent);
			}
			if (block.name === "mcp" || block.name.startsWith("mcp__")) {
				stats.mcpCalls += 1;
				if (block.name.startsWith("mcp__")) servers.add(fromToolName(block.name));
				else if (typeof args.server === "string") servers.add(args.server);
			}
			if (block.name === "read" && typeof args.path === "string") {
				const match = /\/skills\/([^/]+)\//.exec(args.path);
				if (match) skills.add(match[1]);
			}
		}
	}
	stats.agents = [...agents].sort();
	stats.mcpServers = [...servers].sort();
	stats.skills = [...skills].sort();
	return stats;
}

/** `sessions/<project-dir>/*.jsonl` only: `subagent-artifacts` holds child runs, not user sessions. */
function sessionFiles(dir: string, cutoff: number): string[] {
	const files: string[] = [];
	let projects: string[];
	try {
		projects = readdirSync(dir);
	} catch {
		return files;
	}
	for (const project of projects) {
		if (project === "subagent-artifacts") continue;
		const projectDir = join(dir, project);
		let names: string[];
		try {
			if (!statSync(projectDir).isDirectory()) continue;
			names = readdirSync(projectDir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (!name.endsWith(".jsonl")) continue;
			const full = join(projectDir, name);
			try {
				if (statSync(full).mtimeMs >= cutoff) files.push(full);
			} catch {
				// Vanished mid-scan.
			}
		}
	}
	return files.sort();
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export async function mineCoverage(days: number, installed: Inventory, dir = join(agentDir(), "sessions")): Promise<Coverage> {
	const cutoff = Date.now() - days * 86_400_000;
	const files = existsSync(dir) ? sessionFiles(dir, cutoff) : [];
	const agents = new Set<string>();
	const servers = new Set<string>();
	const skills = new Set<string>();
	let sessions = 0;
	let subagentCalls = 0;
	let toolResults = 0;
	let failedResults = 0;
	for (const file of files) {
		const stats = await mineSession(file);
		sessions += 1;
		subagentCalls += stats.subagentCalls;
		toolResults += stats.toolResults;
		failedResults += stats.failedResults;
		for (const agent of stats.agents) agents.add(agent);
		for (const skill of stats.skills) skills.add(skill);
		for (const server of stats.mcpServers) servers.add(server);
	}
	const usedAgents = installed.agents.filter((name) => agents.has(name));
	const usedSkills = installed.skills.filter((name) => skills.has(name));
	const usedMcp = installed.mcp.filter((name) => servers.has(name));
	const used: Inventory = { agents: usedAgents, skills: usedSkills, mcp: usedMcp };
	return {
		days,
		sessions,
		installed,
		used,
		never: {
			agents: installed.agents.filter((name) => !agents.has(name)),
			skills: installed.skills.filter((name) => !skills.has(name)),
			mcp: installed.mcp.filter((name) => !servers.has(name)),
		},
		pct: {
			agents: pct(usedAgents.length, installed.agents.length),
			skills: pct(usedSkills.length, installed.skills.length),
			mcp: pct(usedMcp.length, installed.mcp.length),
		},
		health: { toolResults, failedResults, failedPct: pct(failedResults, toolResults), subagentCalls },
	};
}

const list = (names: string[], max = 10) =>
	names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} … (+${names.length - max})`;

export function formatCoverage(coverage: Coverage): string {
	const lines = [
		`capability coverage (${coverage.days}d, ${coverage.sessions} sessions)`,
		`agents  ${coverage.used.agents.length}/${coverage.installed.agents.length} used (${coverage.pct.agents}%)`,
		`skills  ${coverage.used.skills.length}/${coverage.installed.skills.length} used (${coverage.pct.skills}%)`,
		`mcp     ${coverage.used.mcp.length}/${coverage.installed.mcp.length} used (${coverage.pct.mcp}%)`,
	];
	if (coverage.never.agents.length) lines.push(`never used agents: ${list(coverage.never.agents)}`);
	if (coverage.never.skills.length) lines.push(`never used skills: ${list(coverage.never.skills)}`);
	if (coverage.never.mcp.length) lines.push(`never used mcp: ${coverage.never.mcp.join(", ")}`);
	lines.push(
		`health: ${coverage.health.failedPct}% failed tool results, ${coverage.health.subagentCalls} subagent calls`,
	);
	return lines.join("\n");
}

export function readJson<T>(path: string): T | null {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

export function writeJson(path: string, data: unknown): void {
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
