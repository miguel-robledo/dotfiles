import assert from "node:assert/strict";
import { test } from "node:test";
import { audit, collectCalls, findPlan, format, parseCapabilities } from "./core.ts";

const plan = `# Feature

## Capabilities

| Step | Capability | Why |
|---|---|---|
| map callers | \`mcp:codebase-memory-mcp/trace_path\` | 3-hop traversal |
| rename | \`mcp:serena/rename_symbol\` | LSP-precise |
| verify | \`subagent:reviewer\` | blackbox |
| read config | \`read\` | one file |
| format | \`none\` | no tool needed |

Rejected: ponytail-audit — repo-wide.
`;

function assistant(...calls: { name: string; arguments: unknown }[]) {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: calls.map((call, i) => ({
				type: "toolCall",
				id: String(i),
				name: call.name,
				arguments: call.arguments,
			})),
		},
	};
}

test("parses only backticked capability cells", () => {
	const declared = parseCapabilities(plan);
	assert.deepEqual(
		declared.map((d) => d.sig),
		["mcp:codebase-memory-mcp/trace_path", "mcp:serena/rename_symbol", "subagent:reviewer", "read", "none"],
	);
});

test("ignores header and separator rows", () => {
	assert.equal(parseCapabilities("| Step | Capability | Why |\n|---|---|---|\n").length, 0);
});

test("finds the plan and collects later calls only", () => {
	const entries = [
		assistant({ name: "read", arguments: { file: "before" } }),
		assistant({ name: "plan_mode_complete", arguments: { plan } }),
		assistant({ name: "read", arguments: { file: "after" } }),
	];
	const found = findPlan(entries);
	assert.ok(found);
	assert.equal(found.index, 1);
	assert.equal(collectCalls(entries, found.index).length, 1);
});

test("reports declared capabilities that never ran", () => {
	const declared = parseCapabilities(plan);
	const report = audit(declared, [
		{ name: "read", args: "{}" },
		{ name: "mcp__serena", args: JSON.stringify({ tool: "rename_symbol" }) },
	]);
	assert.deepEqual(
		report.missing.map((m) => m.sig),
		["mcp:codebase-memory-mcp/trace_path", "subagent:reviewer"],
	);
	assert.match(format(report), /2\/4 planned capabilities not observed/);
});

test("silent when everything auditable ran", () => {
	const declared = parseCapabilities(plan);
	const report = audit(declared, [
		{ name: "read", args: "{}" },
		{ name: "mcp", args: JSON.stringify({ tool: "trace_path" }) },
		{ name: "mcp", args: JSON.stringify({ tool: "rename_symbol" }) },
		{ name: "subagent", args: JSON.stringify({ agent: "reviewer" }) },
	]);
	assert.equal(report.missing.length, 0);
	assert.equal(format(report), "plan-audit: 4/4 auditable capabilities observed");
});
