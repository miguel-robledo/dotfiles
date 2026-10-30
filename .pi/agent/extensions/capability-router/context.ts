/**
 * Project context for the router: what codebase is this, in one compact line plus a short file list.
 *
 * Measured caveat (2026-10-30): a decision model ignores structured state fields, so this brief is
 * meant to be *phrased into text* for a chat model, not handed to the classifier as JSON.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ProjectBrief {
	cwd: string;
	language?: string;
	manifest?: string;
	framework?: string;
	tree: string[];
	changed: string[];
	text: string;
}

const MANIFESTS: Array<[string, string]> = [
	["Cargo.toml", "rust"],
	["package.json", "typescript"],
	["pyproject.toml", "python"],
	["requirements.txt", "python"],
	["go.mod", "go"],
	["pom.xml", "java"],
	["build.gradle", "java"],
	["build.gradle.kts", "kotlin"],
	["Gemfile", "ruby"],
	["composer.json", "php"],
	["mix.exs", "elixir"],
];

const NOISE = new Set([
	"node_modules", ".git", "target", "dist", "build", ".next", "venv", ".venv", "__pycache__",
	".turbo", "coverage", ".idea", ".vscode", "vendor", "out", ".cache", ".pi",
]);

/** Which manifest is present, newest language first. */
export function detectManifest(entries: string[]): { language: string; manifest: string } | null {
	for (const [manifest, language] of MANIFESTS) if (entries.includes(manifest)) return { language, manifest };
	return null;
}

/** A short framework hint from package.json / Cargo.toml dependency names. */
export function detectFramework(dir: string, manifest?: string): string | undefined {
	if (!manifest) return undefined;
	const frameworks: Array<[string, string[]]> = [
		["next.js", ["next"]],
		["react", ["react"]],
		["vue", ["vue"]],
		["svelte", ["svelte"]],
		["express", ["express"]],
		["nest", ["@nestjs/core"]],
		["django", ["django"]],
		["fastapi", ["fastapi"]],
		["axum", ["axum"]],
		["actix", ["actix-web"]],
		["tokio", ["tokio"]],
		["sqlx", ["sqlx"]],
		["prisma", ["prisma", "@prisma/client"]],
		["drizzle", ["drizzle-orm"]],
	];
	try {
		const raw = readFileSync(join(dir, manifest), "utf8");
		const found = frameworks.filter(([, keys]) => keys.some((key) => raw.includes(key))).map(([name]) => name);
		return found.slice(0, 3).join(", ") || undefined;
	} catch {
		return undefined;
	}
}

function safeReaddir(dir: string): string[] {
	try {
		return readdirSync(dir).filter((name) => !name.startsWith("."));
	} catch {
		return [];
	}
}

/** Top-level entries only, noise removed, files and directories distinguished by trailing slash. */
export function topLevelTree(dir: string, limit = 25): string[] {
	const entries = safeReaddir(dir).filter((name) => !NOISE.has(name)).sort();
	return entries.slice(0, limit).map((name) => {
		try {
			return statSync(join(dir, name)).isDirectory() ? `${name}/` : name;
		} catch {
			return name;
		}
	});
}

function git(cwd: string, args: string[], timeout = 1500): Promise<string> {
	return new Promise((resolve) => {
		execFile("git", args, { cwd, timeout, maxBuffer: 64 * 1024 }, (error, stdout) => resolve(error ? "" : stdout));
	});
}

/** Files with uncommitted changes, plus the last commit's files when the tree is clean. */
async function changedFiles(cwd: string, limit = 12): Promise<string[]> {
	const status = await git(cwd, ["status", "--porcelain"]);
	const fromStatus = status
		.split("\n")
		.map((line) => line.slice(3).trim())
		.filter(Boolean);
	if (fromStatus.length > 0) return [...new Set(fromStatus)].slice(0, limit);
	const last = await git(cwd, ["show", "--name-only", "--pretty=format:", "HEAD"]);
	return [...new Set(last.split("\n").map((line) => line.trim()).filter(Boolean))].slice(0, limit);
}

export function formatBrief(brief: Omit<ProjectBrief, "text">): string {
	const parts: string[] = [];
	if (brief.language) parts.push(`${brief.language}${brief.manifest ? ` (${brief.manifest})` : ""}`);
	if (brief.framework) parts.push(brief.framework);
	const head = parts.length > 0 ? `project: ${parts.join(", ")}` : "project: unknown";
	const lines = [head];
	if (brief.tree.length > 0) lines.push(`tree: ${brief.tree.join(", ")}`);
	if (brief.changed.length > 0) lines.push(`changed: ${brief.changed.join(", ")}`);
	return lines.join("\n");
}

/** Read the working directory once per session; callers cache by cwd. */
export async function projectBrief(cwd: string): Promise<ProjectBrief> {
	const entries = safeReaddir(cwd);
	const found = detectManifest(entries);
	const base = {
		cwd,
		language: found?.language,
		manifest: found?.manifest,
		framework: found ? detectFramework(cwd, found.manifest) : undefined,
		tree: topLevelTree(cwd),
		changed: existsSync(join(cwd, ".git")) ? await changedFiles(cwd) : [],
	};
	return { ...base, text: formatBrief(base) };
}
