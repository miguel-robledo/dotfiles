import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { audit, collectCalls, findPlan, format, type Report } from "./core.ts";

function check(ctx: any): { report: Report; calls: number } | null {
	const entries = ctx.sessionManager.getBranch();
	const plan = findPlan(entries);
	if (!plan) return null;
	const calls = collectCalls(entries, plan.index);
	return { report: audit(plan.declared, calls), calls: calls.length };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("plan-audit", {
		description: "Compare the plan's Capabilities table with the tool calls that ran",
		handler: async (_args, ctx) => {
			try {
				const result = check(ctx);
				const text = result
					? format(result.report)
					: "No plan_mode_complete call in this session.";
				ctx.ui.notify(text, result?.report.missing.length ? "warning" : "info");
				pi.appendEntry("plan-audit", result?.report ?? { note: "no plan" });
			} catch (error) {
				ctx.ui.notify(`plan-audit failed (ignored): ${String(error)}`, "info");
			}
		},
	});

	// Silent unless a plan exists, tools actually ran, and something declared is missing.
	pi.on("agent_settled", async (_event, ctx) => {
		try {
			const result = check(ctx);
			if (!result || result.calls === 0 || result.report.missing.length === 0) return;
			pi.appendEntry("plan-audit", result.report);
			if (ctx.hasUI) ctx.ui.notify(format(result.report), "warning");
		} catch {
			// Never let an audit break the session.
		}
	});
}
