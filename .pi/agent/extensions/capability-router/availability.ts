/**
 * Can a declared capability actually run here?
 *
 * Measured motivation: a real plan declared `mcp:serena` for PHP symbol edits and
 * `mcp:codebase-memory-mcp` for call graphs. Neither could run — no PHP language server on PATH, and
 * the project was not indexed. The model discovered this by trying, then the run continued.
 *
 * So before nagging the model to use a declared mcp capability, check the cheap local precondition:
 * a missing language server or browser binary is a *configuration* problem for the human, not a
 * discipline problem for the agent.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Language servers serena can drive, most specific first. Checked on PATH. */
const LSP_BINARIES: Record<string, string[]> = {
	php: ["intelephense", "phpactor", "php-language-server"],
	typescript: ["typescript-language-server", "tsserver"],
	javascript: ["typescript-language-server", "tsserver"],
	rust: ["rust-analyzer"],
	python: ["pylsp", "pyright-langserver", "basedpyright-langserver"],
	go: ["gopls"],
	java: ["jdtls", "java-language-server"],
	kotlin: ["kotlin-language-server"],
	ruby: ["solargraph"],
	elixir: ["elixir-ls", "language_server.sh"],
	csharp: ["omnisharp"],
};

export interface Precondition {
	usable: boolean;
	/** What is missing, in the user's terms. */
	reason?: string;
	/** The concrete action that fixes it. */
	fix?: string;
}

export interface ProbeDeps {
	/** Project language, from the brief (`php`, `typescript`, …). Informational only. */
	language?: string;
	/** Is this binary on PATH? */
	which: (binary: string) => boolean;
	/** Does this absolute path exist? */
	exists: (path: string) => boolean;
	/** Chromium path pinned in `~/.config/mcp/mcp.json`, when known. */
	browserPath?: string;
	/** Per-project index file that codebase-memory-mcp keeps in its cache dir. */
	cbmDbPath?: string;
}

/** Pure decision logic; IO lives in the caller so this is testable. */
export function probeCapability(signature: string, deps: ProbeDeps): Precondition {
	const sig = signature.toLowerCase();

	// serena spawns its own language servers, configured per project in `.serena/project.yml`. A binary
	// missing from PATH proves nothing (it may be launched via npx/uvx), so serena is never blocked on a
	// guess — only on the error serena itself returns, which the caller records from tool results.
	if (sig.startsWith("mcp:serena")) return { usable: true };

	// codebase-memory-mcp keeps one SQLite file per indexed project, named after the cwd slug.
	if (sig.startsWith("mcp:codebase-memory-mcp")) {
		if (!deps.cbmDbPath) return { usable: true };
		if (deps.exists(deps.cbmDbPath)) return { usable: true };
		return {
			usable: false,
			reason: `this project is not indexed in codebase-memory-mcp (no ${deps.cbmDbPath.split("/").pop()})`,
			fix: `index it once: call the codebase-memory-mcp index tool for this directory, or drop the codebase-memory-mcp row`,
		};
	}

	// playwright needs the browser binary pinned in the MCP config.
	if (sig.startsWith("mcp:playwright")) {
		if (!deps.browserPath) return { usable: true };
		if (deps.exists(deps.browserPath)) return { usable: true };
		return {
			usable: false,
			reason: `playwright's browser is missing at ${deps.browserPath}`,
			fix: `run: bunx playwright install chromium (or fix the executable path in ~/.config/mcp/mcp.json)`,
		};
	}

	return { usable: true };
}

/** `which` over PATH, without spawning a shell. */
export function whichOnPath(binary: string, env = process.env): boolean {
	const dirs = (env.PATH ?? "").split(":").filter(Boolean);
	return dirs.some((dir) => existsSync(join(dir, binary)));
}

/** Chromium path pinned in the MCP config, if the server is configured with one. */
export function configuredBrowserPath(configPath = join(process.env.HOME ?? ".", ".config", "mcp", "mcp.json")): string | undefined {
	try {
		const config = JSON.parse(readFileSync(configPath, "utf8")) as { mcpServers?: Record<string, { args?: string[] }> };
		const args = config.mcpServers?.playwright?.args ?? [];
		const index = args.indexOf("--executable-path");
		return index >= 0 ? args[index + 1] : undefined;
	} catch {
		return undefined;
	}
}

/** The cache file codebase-memory-mcp would use for this project: `/<a>/<b>` → `<a>-<b>.db`. */
export function cbmIndexPath(cwd: string, cacheDir = join(process.env.HOME ?? ".", ".cache", "codebase-memory-mcp")): string {
	const slug = cwd.replace(/^\//, "").replace(/[\\/:]/g, "-");
	return join(cacheDir, `${slug}.db`);
}

/** Languages serena is configured for in this project (`.serena/project.yml`), if any. */
export function serenaLanguages(cwd: string): string[] {
	try {
		const yml = readFileSync(join(cwd, ".serena", "project.yml"), "utf8");
		const match = /^languages:\s*(.+)$/m.exec(yml);
		if (!match) return [];
		return match[1]
			.replace(/[\[\]"']/g, "")
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}
