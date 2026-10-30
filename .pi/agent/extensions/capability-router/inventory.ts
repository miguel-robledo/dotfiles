/**
 * The `capabilities` tool: the installed inventory, readable by the model.
 *
 * `/capabilities` is a slash command, which only a human can invoke. This tool is the same data
 * behind a model-callable surface, so an agent in the middle of a run can look up what exists
 * instead of relying on the 1.7k-char prompt summary or a hand-written memory of it.
 *
 * Two sizes on purpose: names (cheap, ~1.5k chars) and full descriptions (~33k chars, the same
 * budget as reading TOOLS.md). Filters keep it usable without reading everything.
 */
import type { CapabilityIndex } from "./indexer.ts";
import type { RouteMap } from "./router.ts";

export type CapabilityKind = "all" | "agents" | "skills" | "mcp" | "packages" | "prompts";

// Plain JSON Schema: `typebox` is not resolvable from a user extension directory, and the runtime
// only needs a schema object.
export const CAPABILITY_PARAMS = {
	type: "object",
	properties: {
		kind: {
			type: "string",
			enum: ["all", "agents", "skills", "mcp", "packages", "prompts"],
			description: "Which part of the inventory to list. Default: all.",
		},
		detail: {
			type: "string",
			enum: ["names", "full"],
			description: "names: ~1.5k chars. full: one line per capability with its description (~33k chars). Default: names.",
		},
		query: { type: "string", description: "Only entries whose name or description contains this text (case-insensitive)." },
		limit: { type: "number", description: "Max entries per section. Default 200." },
	},
	additionalProperties: false,
} as const;

export interface InventoryLine {
	kind: "agent" | "skill" | "mcp" | "package" | "prompt";
	name: string;
	description: string;
}

/** Flatten the index into one list so filters apply uniformly. Pure; testable without Pi. */
export function inventoryLines(index: CapabilityIndex, map: RouteMap): InventoryLine[] {
	const purposes = map.purposes ?? {};
	const lines: InventoryLine[] = [];
	for (const agent of index.agents) lines.push({ kind: "agent", name: agent.name, description: agent.description });
	for (const entry of index.skillEntries) lines.push({ kind: "skill", name: entry.name, description: `${entry.description}${entry.source === "user" ? "" : ` (package: ${entry.source})`}` });
	for (const server of index.mcpServers) lines.push({ kind: "mcp", name: server, description: purposes[`mcp.${server}`] ?? "" });
	for (const pkg of index.packages) lines.push({ kind: "package", name: pkg, description: purposes[`pkg.${pkg}`] ?? "" });
	for (const prompt of index.prompts) lines.push({ kind: "prompt", name: prompt, description: "" });
	return lines;
}

const SECTION: Record<InventoryLine["kind"], string> = {
	agent: "agents",
	skill: "skills",
	mcp: "mcp servers",
	package: "packages",
	prompt: "prompt templates",
};

const WANTED: Record<Exclude<CapabilityKind, "all">, InventoryLine["kind"]> = {
	agents: "agent",
	skills: "skill",
	mcp: "mcp",
	packages: "package",
	prompts: "prompt",
};

export interface InventoryRequest {
	kind?: CapabilityKind;
	detail?: "names" | "full";
	query?: string;
	limit?: number;
}

/** Render the inventory for a tool call or the slash command. Pure; testable. */
export function renderInventory(
	lines: InventoryLine[],
	request: InventoryRequest,
	header: (total: number, shown: number) => string,
): string {
	const kind = request.kind ?? "all";
	const detail = request.detail ?? "names";
	const limit = request.limit && request.limit > 0 ? request.limit : 200;
	const query = request.query?.toLowerCase().trim();
	const wanted = kind === "all" ? null : WANTED[kind];
	const filtered = lines.filter(
		(line) => (!wanted || line.kind === wanted) && (!query || `${line.name} ${line.description}`.toLowerCase().includes(query)),
	);
	const out: string[] = [header(filtered.length, filtered.length)];
	const groups = new Map<InventoryLine["kind"], InventoryLine[]>();
	for (const line of filtered) {
		const list = groups.get(line.kind) ?? [];
		list.push(line);
		groups.set(line.kind, list);
	}
	for (const [groupKind, group] of groups) {
		const shown = group.slice(0, limit);
		out.push(`\n## ${SECTION[groupKind]} (${group.length})`);
		for (const line of shown) {
			out.push(detail === "full" && line.description ? `${line.name}: ${line.description}` : line.name);
		}
		if (group.length > shown.length) out.push(`… ${group.length - shown.length} more (raise limit)`);
	}
	return out.join("\n");
}
