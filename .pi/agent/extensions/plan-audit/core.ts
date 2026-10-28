/**
 * Plan-audit: compares the `## Capabilities` table of the last plan with the tool
 * calls that actually ran in the session. Advisory by design — it reports, never
 * blocks.
 */

export interface Entry {
	type?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
}

export interface Declared {
	step: string;
	sig: string;
	family: string;
}

export interface Call {
	name: string;
	args: string;
}

export interface Report {
	declared: Declared[];
	observed: string[];
	missing: Declared[];
	planIndex: number;
}

const BACKTICK = /`([^`]+)`/;
const NOT_AUDITABLE = new Set(["none", "skill"]);

export function parseCapabilities(plan: string): Declared[] {
	const out: Declared[] = [];
	for (const line of plan.split("\n")) {
		const row = line.trim();
		if (!row.startsWith("|")) continue;
		const cells = row.split("|").map((c) => c.trim());
		if (cells.length < 4) continue;
		const match = cells[2].match(BACKTICK);
		if (!match) continue;
		const sig = match[1].trim();
		out.push({ step: cells[1], sig, family: sig.split(/[:/]/)[0].toLowerCase() });
	}
	return out;
}

export function findPlan(entries: Entry[]): { declared: Declared[]; index: number } | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const message = entries[i]?.message;
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const block of message.content as any[]) {
			if (block?.type !== "toolCall" || block.name !== "plan_mode_complete") continue;
			const plan = typeof block.arguments?.plan === "string" ? block.arguments.plan : "";
			const declared = parseCapabilities(plan);
			return declared.length > 0 ? { declared, index: i } : null;
		}
	}
	return null;
}

export function collectCalls(entries: Entry[], fromIndex: number): Call[] {
	const calls: Call[] = [];
	for (let i = fromIndex + 1; i < entries.length; i++) {
		const message = entries[i]?.message;
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const block of message.content as any[]) {
			if (block?.type !== "toolCall") continue;
			calls.push({ name: String(block.name), args: JSON.stringify(block.arguments ?? {}) });
		}
	}
	return calls;
}

function mentions(args: string, sig: string): boolean {
	return sig
		.split(/[:/]/)
		.slice(1)
		.some((part) => part.length > 2 && args.includes(part));
}

function matches(declared: Declared, call: Call): boolean {
	switch (declared.family) {
		case "mcp":
			if (call.name !== "mcp" && !call.name.startsWith("mcp__")) return false;
			return mentions(call.args, declared.sig);
		case "subagent":
			return call.name === "subagent" && mentions(call.args, declared.sig);
		default:
			return call.name === declared.sig;
	}
}

export function audit(declared: Declared[], calls: Call[]): Report {
	const missing = declared.filter(
		(d) => !NOT_AUDITABLE.has(d.family) && !calls.some((c) => matches(d, c)),
	);
	const counts = new Map<string, number>();
	for (const call of calls) counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
	return {
		declared,
		observed: [...counts].map(([name, count]) => `${name}×${count}`),
		missing,
		planIndex: -1,
	};
}

export function format(report: Report): string {
	const auditable = report.declared.filter((d) => !NOT_AUDITABLE.has(d.family)).length;
	if (report.missing.length === 0) {
		return `plan-audit: ${auditable}/${auditable} auditable capabilities observed`;
	}
	const observed = report.observed.length > 0 ? report.observed.join(", ") : "none";
	return `plan-audit: ${report.missing.length}/${auditable} planned capabilities not observed — ${report.missing
		.map((m) => m.sig)
		.join(", ")}. Observed: ${observed}.`;
}
