/**
 * Index of what is installed on this machine, and the capabilities the router can offer.
 *
 * Nothing here is hand-written per capability: agents and skills carry their own `description` in
 * frontmatter, and MCP servers get a one-line purpose from map.json (a fact about the server, not a
 * guess about the user's vocabulary).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RouteMap } from "./router.ts";

export interface AgentInfo {
	name: string;
	description: string;
	category: string;
}

export interface SkillEntry {
	name: string;
	path: string;
	source: string;
	description: string;
}

export interface CapabilityIndex {
	agentDir: string;
	agents: AgentInfo[];
	/** User skills plus skills shipped by packages — the inventory Pi actually advertises. */
	skills: string[];
	skillEntries: SkillEntry[];
	mcpServers: string[];
	packages: string[];
	prompts: string[];
	warnings: string[];
}

export type CapabilityKind = "agent" | "skill" | "mcp";

export interface Capability {
	/** Stable key, also the judge's option label: `agent:engineering-code-reviewer`. */
	id: string;
	kind: CapabilityKind;
	name: string;
	description: string;
	syntax: string;
}

/** `name: value` lines inside the leading `---` block. Enough for frontmatter; no YAML dep. */
export function parseFrontmatter(text: string): Record<string, string> {
	const fields: Record<string, string> = {};
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) return fields;
	for (const line of match[1].split(/\r?\n/)) {
		const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
		if (pair) fields[pair[1]] = pair[2];
	}
	return fields;
}

function readText(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function listNames(dir: string, extension: string): string[] {
	try {
		if (!statSync(dir).isDirectory()) return [];
		return readdirSync(dir)
			.filter((name) => !name.startsWith(".") && name.endsWith(extension))
			.map((name) => name.slice(0, name.length - extension.length))
			.sort();
	} catch {
		return [];
	}
}

/** `engineering-code-reviewer` → `engineering`; the roster is named `<category>-<role>`. */
export function categoryOf(name: string): string {
	const dash = name.indexOf("-");
	return dash === -1 ? name : name.slice(0, dash);
}

/** `git:github.com/obra/superpowers` → `superpowers`; `npm:pi-background-tasks@latest` → `pi-background-tasks`. */
export function shortPackage(source: string): string {
	const tail = source.slice(Math.max(source.lastIndexOf("/"), source.lastIndexOf(":")) + 1);
	return tail.replace(/@[^@]*$/, "") || source;
}

/** Skills live in directories with a `SKILL.md`. */
function skillEntriesIn(dir: string, source: string, out: SkillEntry[]): void {
	let entries: Array<{ name: string }>;
	try {
		entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
	} catch {
		return;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name, "SKILL.md");
		if (!existsSync(path)) continue;
		out.push({ name: entry.name, path, source, description: clean(parseFrontmatter(readText(path)).description ?? "") });
	}
}

/** Directories under which the package managers unpack skills: `skills/<name>/SKILL.md`. */
function packageSkillRoots(agentDir: string): Array<{ dir: string; source: string }> {
	const roots: Array<{ dir: string; source: string }> = [];
	const add = (dir: string, source: string) => {
		if (existsSync(dir) && !dir.includes("/examples/")) roots.push({ dir, source });
	};
	const npmDir = join(agentDir, "npm", "node_modules");
	for (const name of safeNames(npmDir)) {
		if (name.startsWith("@")) {
			for (const scoped of safeNames(join(npmDir, name))) {
				add(join(npmDir, name, scoped, "skills"), scoped);
				add(join(npmDir, name, scoped, "integrations"), scoped);
			}
			continue;
		}
		add(join(npmDir, name, "skills"), name);
		add(join(npmDir, name, "integrations"), name);
	}
	const gitDir = join(agentDir, "git");
	for (const host of safeNames(gitDir)) {
		for (const owner of safeNames(join(gitDir, host))) {
			for (const repo of safeNames(join(gitDir, host, owner))) {
				add(join(gitDir, host, owner, repo, "skills"), repo);
			}
		}
	}
	return roots;
}

function safeNames(dir: string): string[] {
	try {
		return readdirSync(dir).filter((name) => !name.startsWith("."));
	} catch {
		return [];
	}
}

/**
 * User skills first, then package skills. Duplicate names keep the user copy, which is the one Pi
 * gives precedence to.
 */
export function listSkills(agentDir: string): SkillEntry[] {
	const entries: SkillEntry[] = [];
	skillEntriesIn(join(agentDir, "skills"), "user", entries);
	const seen = new Set(entries.map((entry) => entry.name));
	for (const root of packageSkillRoots(agentDir)) {
		const found: SkillEntry[] = [];
		skillEntriesIn(root.dir, root.source, found);
		for (const entry of found) {
			if (seen.has(entry.name)) continue;
			seen.add(entry.name);
			entries.push(entry);
		}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildIndex(agentDir: string, runtime: { mcpServers?: string[]; packages?: string[] } = {}): CapabilityIndex {
	const warnings: string[] = [];

	const agents: AgentInfo[] = [];
	const agentsDir = join(agentDir, "agents");
	for (const name of listNames(agentsDir, ".md")) {
		const fields = parseFrontmatter(readText(join(agentsDir, `${name}.md`)));
		agents.push({ name: fields.name || name, description: fields.description || "", category: categoryOf(name) });
	}

	let packages = runtime.packages ?? [];
	if (!runtime.packages) {
		try {
			const settings = JSON.parse(readText(join(agentDir, "settings.json")));
			packages = Array.isArray(settings.packages)
				? settings.packages.map((entry: unknown) =>
						shortPackage(typeof entry === "string" ? entry : String((entry as { source?: string })?.source ?? "")),
					)
				: [];
		} catch {
			warnings.push("settings.json not readable; package list empty");
		}
	}

	let mcpServers = runtime.mcpServers ?? [];
	if (mcpServers.length === 0) {
		const mcpPath = join(process.env.HOME ?? ".", ".config", "mcp", "mcp.json");
		try {
			mcpServers = Object.keys(JSON.parse(readText(mcpPath)).mcpServers ?? {});
		} catch {
			warnings.push("no MCP server list from the runtime or ~/.config/mcp/mcp.json");
		}
	}

	const skillEntries = listSkills(agentDir);
	return {
		agentDir,
		agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
		skills: skillEntries.map((entry) => entry.name),
		skillEntries,
		mcpServers: [...mcpServers].sort(),
		packages: [...new Set(packages)].sort(),
		prompts: listNames(join(agentDir, "prompts"), ".md"),
		warnings,
	};
}

const MAX_DESCRIPTION = 240;

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);

/** Every callable capability with its real description. This is what the router searches. */
export function buildCapabilities(index: CapabilityIndex, map: RouteMap): Capability[] {
	const syntax = map.syntax ?? {};
	const agentSyntax = syntax.agent ?? 'subagent({agent:"<name>", task:"..."})';
	const skillSyntax = syntax.skill ?? "read ~/.pi/agent/skills/<name>/SKILL.md";
	const mcpSyntax = syntax.mcp ?? 'mcp({server:"<name>", tool:"<tool>", args:{...}})';
	const capabilities: Capability[] = [];

	for (const agent of index.agents) {
		capabilities.push({
			id: `agent:${agent.name}`,
			kind: "agent",
			name: agent.name,
			description: clean(agent.description) || agent.name.replace(/-/g, " "),
			syntax: agentSyntax.replace("<name>", agent.name),
		});
	}

	for (const entry of index.skillEntries) {
		capabilities.push({
			id: `skill:${entry.name}`,
			kind: "skill",
			name: entry.name,
			description: entry.description || entry.name.replace(/-/g, " "),
			syntax: skillSyntax.replace("<name>", entry.name),
		});
	}

	for (const server of index.mcpServers) {
		capabilities.push({
			id: `mcp:${server}`,
			kind: "mcp",
			name: server,
			description: clean(map.purposes?.[`mcp.${server}`] ?? "") || server,
			syntax: mcpSyntax.replace("<name>", server),
		});
	}

	return capabilities;
}

/** Categories with up to three agents each, alphabetical and deterministic. */
export function categoryExemplars(index: CapabilityIndex): Array<{ category: string; agents: string[] }> {
	const byCategory = new Map<string, string[]>();
	for (const agent of index.agents) {
		const list = byCategory.get(agent.category) ?? [];
		if (list.length < 3) list.push(agent.name);
		byCategory.set(agent.category, list);
	}
	return [...byCategory.entries()].map(([category, agents]) => ({ category, agents }));
}

/** Static section injected into the system prompt. Byte-stable for the same machine state. */
export function renderCapabilitySection(index: CapabilityIndex, map: RouteMap): string {
	const purposes = map.purposes ?? {};
	const lines = [
		`Installed capabilities, indexed by capability-router (${index.agents.length} agents installed, 2 advertised):`,
		`- Agents: call subagent({agent:"<name>", task:"..."}); full roster with subagent({action:"list"}).`,
	];
	for (const { category, agents } of categoryExemplars(index)) lines.push(`  ${category}: ${agents.join(", ")}`);
	lines.push(
		`- MCP (${index.mcpServers.length}): ${index.mcpServers.map((server) => `${server} = ${purposes[`mcp.${server}`] ?? "purpose unset"}`).join("; ")}. Call mcp({server:"<name>", tool:"<tool>", args:{...}}).`,
		"- Multi-part work: one workflow with parallel lanes — runs.lanes([{key, stages:[...]}]) — for gates and worktrees.",
		"- Skills are listed above by name; a task-matched hint may name one. /capabilities prints the full index and coverage.",
	);
	return lines.join("\n");
}

/** `/capabilities` output: counts, categories, MCP purposes, packages. */
export function formatIndex(index: CapabilityIndex, map: RouteMap): string {
	const purposes = map.purposes ?? {};
	const lines = [
		`capability-router index (${index.agentDir})`,
		`agents: ${index.agents.length} (advertised: 2) | skills: ${index.skills.length} | mcp: ${index.mcpServers.length} | packages: ${index.packages.length} | prompts: ${index.prompts.length}`,
		"",
		"agent categories:",
	];
	for (const { category, agents } of categoryExemplars(index)) {
		const total = index.agents.filter((agent) => agent.category === category).length;
		lines.push(`  ${category} (${total}): ${agents.join(", ")}`);
	}
	lines.push("", "mcp:", ...index.mcpServers.map((server) => `  ${server}: ${purposes[`mcp.${server}`] ?? "purpose unset"}`));
	lines.push("", "packages:", ...index.packages.map((name) => `  ${name}: ${purposes[`pkg.${name}`] ?? "purpose unset"}`));
	lines.push("", "prompts:", `  ${index.prompts.join(", ") || "(none)"}`);
	if (index.warnings.length > 0) lines.push("", "warnings:", ...index.warnings.map((warning) => `  ${warning}`));
	return lines.join("\n");
}
