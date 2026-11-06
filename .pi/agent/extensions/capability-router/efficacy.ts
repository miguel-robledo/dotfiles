/**
 * Did the capability we showed actually get used?
 *
 * The router has recorded what it suggested since 2026-10-30 (`usage.jsonl`), and coverage since
 * earlier, but never the causal link between the two: a suggestion at turn 0 and a call at tool 20
 * are not evidence of anything unless the call came after the hint and inside a bounded window.
 * Without that number every change to the hint is a guess — which is how the usage report, the
 * watchdog and the first router all shipped and were all retired.
 *
 * So: for every capability this session's prompt named, find the session transcript, walk the tool
 * calls after the hint's timestamp, and ask whether any of the next `window` calls satisfies it.
 * Retroactive, no model calls, no new recording — `usage.jsonl` plus the session files already hold
 * both halves.
 *
 * The match rule is `conformance.satisfiedBy`, deliberately: the report must count a hit the same way
 * the in-run check does, or the two disagree about the same run.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { agentDir } from "./report.ts";
import { familyOf, satisfiedBy, setKnownServers, type DeclaredRow } from "./conformance.ts";

export interface Shown {
	ts: number;
	/** Present from the recorder fix onward; absent on every earlier row. */
	shownAt?: number;
	session: string;
	sig: string;
}

export interface CallMark {
	ts: number;
	family: string;
}

export interface EfficacyOutcome {
	sig: string;
	shown: number;
	used: number;
}

export interface Efficacy {
	days: number;
	window: number;
	sessions: number;
	shown: number;
	used: number;
	pct: number;
	/** How many hints were measured exactly (recorder fixed) vs reconstructed from the run. */
	basis: { exact: number; run: number };
	rows: EfficacyOutcome[];
	/** Shown at least `MIN_REPORTED` times and never used afterwards. */
	neverUsed: string[];
}

/** `agent:` rows name a subagent; an observed call is `subagent:<name>` (conformance's vocabulary). */
export function normalizeSig(sig: string): string {
	return sig.startsWith("agent:") ? `subagent:${sig.slice("agent:".length)}` : sig;
}

const declaredRow = (sig: string): DeclaredRow => ({
	step: "",
	sig: normalizeSig(sig),
	family: normalizeSig(sig).split(/[:/]/)[0].toLowerCase(),
});

/** Does any call in `calls` (already ordered) satisfy `sig`? */
export function usedWithin(calls: CallMark[], ts: number, sig: string, window: number): boolean {
	const start = calls.findIndex((call) => call.ts > ts);
	if (start === -1) return false;
	return satisfiedBy(declaredRow(sig), calls.slice(start, start + window).map((call) => call.family));
}

/** One `usage.jsonl` line → what was shown. Tolerant of the pre-2026-10-30 schema. */
export function parseShown(line: string): Shown[] {
	let entry: any;
	try {
		entry = JSON.parse(line);
	} catch {
		return [];
	}
	const ts = Date.parse(String(entry?.ts ?? ""));
	const session = typeof entry?.session === "string" ? entry.session : "";
	if (!Number.isFinite(ts) || !session) return [];
	const shownAt = Date.parse(String(entry?.shownAt ?? ""));
	// `picks` is current; `suggested` and `target` predate it.
	const sigs: unknown[] = Array.isArray(entry.picks)
		? entry.picks
		: Array.isArray(entry.suggested)
			? entry.suggested
			: typeof entry.target === "string"
				? [entry.target]
				: [];
	return sigs
		.filter((sig): sig is string => typeof sig === "string" && sig.includes(":"))
		.map((sig) => ({ ts, ...(Number.isFinite(shownAt) ? { shownAt } : {}), session, sig }));
}

/** One session transcript line → the tool calls it carries. Non-call lines are skipped unparsed. */
export function parseCallLine(line: string): CallMark[] {
	if (!line.includes('"type":"toolCall"')) return [];
	let entry: any;
	try {
		entry = JSON.parse(line);
	} catch {
		return [];
	}
	const ts = Date.parse(String(entry?.timestamp ?? ""));
	if (!Number.isFinite(ts)) return [];
	const content = entry?.message?.content;
	if (!Array.isArray(content)) return [];
	const calls: CallMark[] = [];
	for (const block of content) {
		if (block?.type !== "toolCall" || typeof block.name !== "string") continue;
		calls.push({ ts, family: familyOf(block.name, block.arguments ?? {}) });
	}
	return calls;
}

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

/** Session file names carry the id after the timestamp: `<iso>_<uuid>.jsonl`. */
export function sessionIdFromPath(path: string): string | null {
	return UUID.exec(path.split("/").pop() ?? "")?.[1] ?? null;
}

export function readShown(path: string): Shown[] {
	if (!existsSync(path)) return [];
	const shown: Shown[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) shown.push(...parseShown(line));
	return shown;
}

export async function sessionCalls(file: string): Promise<CallMark[]> {
	const calls: CallMark[] = [];
	const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
	for await (const line of rl) calls.push(...parseCallLine(line));
	return calls.sort((a, b) => a.ts - b.ts);
}

/** Top-level session files only: nested `run-0/session.jsonl` are subagent runs, not user sessions. */
export function sessionFiles(dir: string, since: number): string[] {
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
				if (statSync(full).mtimeMs >= since) files.push(full);
			} catch {
				// Vanished mid-scan.
			}
		}
	}
	return files.sort();
}

/** A capability shown fewer than this many times is not evidence either way. */
export const MIN_REPORTED = 3;

/**
 * The calls a hint is answerable for.
 *
 * Exact basis: the row carries `shownAt`, so the window is the next `window` calls.
 * Run basis (every row written before the recorder fix): the row is stamped at settle, so the only
 * defensible window is the run it belongs to — after the previous hint in the same session, up to
 * this row's timestamp. Measuring "calls after `ts`" on those rows finds nothing, which is an
 * artifact of the recorder and not a behaviour.
 */
export function windowFor(entry: Shown, previousTs: number, calls: CallMark[], window: number): CallMark[] {
	if (entry.shownAt !== undefined) {
		const start = calls.findIndex((call) => call.ts > entry.shownAt!);
		return start === -1 ? [] : calls.slice(start, start + window);
	}
	return calls.filter((call) => call.ts > previousTs && call.ts <= entry.ts);
}

export function summarize(shown: Shown[], calls: Map<string, CallMark[]>, window: number): EfficacyOutcome[] {
	const perSession = new Map<string, Shown[]>();
	for (const entry of shown) {
		const list = perSession.get(entry.session) ?? [];
		list.push(entry);
		perSession.set(entry.session, list);
	}
	const counts = new Map<string, EfficacyOutcome>();
	for (const [session, list] of perSession) {
		const sessionCalls = calls.get(session) ?? [];
		list.sort((a, b) => a.ts - b.ts);
		let previousTs = -Infinity;
		for (const entry of list) {
			const sig = normalizeSig(entry.sig);
			const row = counts.get(sig) ?? { sig, shown: 0, used: 0 };
			row.shown += 1;
			const slice = windowFor(entry, previousTs, sessionCalls, window);
			if (satisfiedBy(declaredRow(sig), slice.map((call) => call.family))) row.used += 1;
			counts.set(sig, row);
			previousTs = entry.ts;
		}
	}
	return [...counts.values()].sort((a, b) => b.shown - a.shown || a.sig.localeCompare(b.sig));
}

export async function mineEfficacy(paths: {
	usage: string;
	sessionsDir: string;
	days: number;
	window: number;
}): Promise<Efficacy> {
	const since = Date.now() - paths.days * 86_400_000;
	const shown = readShown(paths.usage).filter((entry) => entry.ts >= since);
	const bySession = new Map<string, CallMark[]>();
	for (const file of sessionFiles(paths.sessionsDir, since)) {
		const id = sessionIdFromPath(file);
		if (!id) continue;
		bySession.set(id, await sessionCalls(file));
	}
	const matched = shown.filter((entry) => bySession.has(entry.session));
	const rows = summarize(matched, bySession, paths.window);
	const total = rows.reduce((sum, row) => sum + row.shown, 0);
	const used = rows.reduce((sum, row) => sum + row.used, 0);
	const exact = matched.filter((entry) => entry.shownAt !== undefined).length;
	return {
		days: paths.days,
		window: paths.window,
		sessions: bySession.size,
		shown: total,
		used,
		pct: total === 0 ? 0 : Math.round((used / total) * 1000) / 10,
		basis: { exact, run: total - exact },
		rows,
		neverUsed: rows.filter((row) => row.shown >= MIN_REPORTED && row.used === 0).map((row) => row.sig),
	};
}

export function formatEfficacy(report: Efficacy): string {
	const lines = [
		`capability efficacy (${report.days}d, ${report.sessions} sessions, window ${report.window} calls)`,
		`shown ${report.shown} · used afterwards ${report.used} (${report.pct}%)`,
		`basis: ${report.basis.exact} exact (hint stamped at shown time) · ${report.basis.run} reconstructed from the run`,
	];
	if (report.shown === 0) {
		lines.push("no hints matched a transcript in this window: nothing to measure yet");
		return lines.join("\n");
	}
	for (const row of report.rows.filter((entry) => entry.shown >= MIN_REPORTED)) {
		const rate = Math.round((row.used / row.shown) * 100);
		lines.push(`  ${row.sig.padEnd(44)} ${String(row.used).padStart(3)}/${String(row.shown).padEnd(3)} ${rate}%`);
	}
	if (report.neverUsed.length) lines.push(`shown ${MIN_REPORTED}+ times, never used after: ${report.neverUsed.join(", ")}`);
	return lines.join("\n");
}

/** `mineEfficacy` with the router's own paths filled in. */
export async function efficacyFor(dir: string, days: number, window: number, servers: string[] = []): Promise<Efficacy> {
	// Without the installed names, `mcp({tool:"serena_find_symbol"})` cannot be resolved to a server and
	// every use in that shape is counted as a miss.
	setKnownServers(servers);
	return mineEfficacy({ usage: join(dir, "usage.jsonl"), sessionsDir: join(agentDir(), "sessions"), days, window });
}
