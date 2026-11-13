// Blocks reads and writes of credential material across auto-approved file tools.
// Bash/eval are exec-tier; their payloads are also screened for protected paths.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

type Rule = { re: RegExp; allow?: RegExp; reason?: string };

const PROTECTED_TEXT = /Documents\/servers\b/i;
const PROTECTED_REASON =
  "~/Documents/servers is a protected directory. Ask the user to handle it directly.";

const RULES: Rule[] = [
  // Explicitly protected project directory.
  {
    re: /(^|\/)Documents\/servers(\/|$)/i,
    reason: PROTECTED_REASON,
  },
  // Environment files, except checked-in templates.
  {
    re: /(^|\/)\.env(?:$|\.)/i,
    allow: /(^|\/)\.env\.(?:example|sample|template|schema|dist|defaults)$/i,
  },
  { re: /(^|\/)\.envrc$/i },
  // Private keys and key stores.
  { re: /\.(?:pem|key|p12|pfx|kdbx)$/i },
  { re: /(^|\/)id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?$/i },
  // Tool and cloud credential stores.
  { re: /(^|\/)\.ssh(\/|$)/i },
  { re: /(^|\/)\.aws(\/|$)/i },
  { re: /(^|\/)\.gnupg(\/|$)/i },
  { re: /(^|\/)\.kube\/config$/i },
  { re: /(^|\/)\.docker\/config\.json$/i },
  { re: /(^|\/)\.config\/gcloud(\/|$)/i },
  { re: /(^|\/)\.config\/gh\/hosts\.ya?ml$/i },
  { re: /(^|\/)\.azure(\/|$)/i },
  { re: /(^|\/)\.npmrc$/i },
  { re: /(^|\/)\.yarnrc\.ya?ml$/i },
  { re: /(^|\/)\.pypirc$/i },
  { re: /(^|\/)\.netrc$/i },
  { re: /(^|\/)\.pgpass$/i },
  { re: /(^|\/)\.git-credentials$/i },
  { re: /(^|\/)\.git\/config$/i },
  { re: /(^|\/)\.git\/credentials$/i },
  { re: /(^|\/)\.gem\/credentials$/i },
  { re: /(^|\/)\.cargo\/credentials(?:\.toml)?$/i },
  { re: /(^|\/)\.claude\.json$/i },
  { re: /(^|\/)\.claude\/\.credentials\.json$/i },
  { re: /(^|\/)\.codex\/auth\.json$/i },
  { re: /(^|\/)\.gemini\/oauth_creds\.json$/i },
  { re: /(^|\/)\.omp\/(?:profiles\/[^/]+\/)?agent\/agent\.db$/i },
  // System credential stores.
  { re: /^\/(?:etc\/(?:shadow|gshadow|sudoers(?:\.d\/.*)?)|root\/\.ssh)(?:\/|$)/i },
];

const PATH_KEYS = [
  "path",
  "paths",
  "file_path",
  "filePath",
  "target",
  "source",
  "destination",
  "from",
  "to",
  "old_path",
  "oldPath",
  "new_path",
  "newPath",
] as const;

const FILE_TOOLS: Record<string, true> = {
  read: true,
  write: true,
  edit: true,
  ast_edit: true,
  glob: true,
  grep: true,
  ast_grep: true,
  find: true,
  delete: true,
  move: true,
  copy: true,
};

const REMOTE_URL = /^(?:ssh|scp|sftp):\/\//i;
const FILE_URL = /^file:\/\//i;
const OTHER_URL = /^[a-z][a-z0-9+.-]*:\/\//i;
const SELECTOR = /:(?:\d[\d+,\-:]*|raw|img|conflicts)$/i;
const ARCHIVE_MEMBER =
  /^(.*\.(?:zip|tar|tgz|gz|bz2|xz|7z|rar|iso|cab|deb|rpm|cpio|ar|lzh|arj|asar|sqlite|sqlite3|db|pdf|docx|pptx|xlsx)):(.+)$/i;

type Offense = { target: string; reason: string };

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function resolveTargets(raw: string, cwd: string): string[] {
  const targets = new Set<string>();
  // grep accepts semicolon-delimited path lists.
  for (const part of raw.split(";")) {
    let value = part.trim();
    if (!value) continue;
    if (REMOTE_URL.test(value)) {
      targets.add(value);
      continue;
    }
    if (FILE_URL.test(value)) {
      try {
        value = decodeURIComponent(new URL(value).pathname);
      } catch {
        continue;
      }
    } else if (OTHER_URL.test(value)) {
      continue;
    }
    value = value.replace(SELECTOR, "");
    const member = value.match(ARCHIVE_MEMBER);
    if (member) {
      targets.add(path.resolve(cwd, expandHome(member[1])));
      targets.add(path.resolve(cwd, expandHome(member[2])));
    } else {
      targets.add(path.resolve(cwd, expandHome(value)));
    }
  }
  return [...targets];
}

function realPaths(target: string): string[] {
  const paths = [target];
  try {
    paths.push(fs.realpathSync(target));
  } catch {
    // Target does not exist yet; resolve its nearest existing parent so a
    // symlinked directory cannot hide a credential file.
    try {
      let dir = path.dirname(target);
      const tail = [path.basename(target)];
      while (dir !== path.dirname(dir)) {
        if (fs.existsSync(dir)) {
          paths.push(path.join(fs.realpathSync(dir), ...tail));
          break;
        }
        tail.unshift(path.basename(dir));
        dir = path.dirname(dir);
      }
    } catch {
      // Keep the lexical path.
    }
  }
  return paths;
}

function findOffense(raw: string, cwd: string): Offense | undefined {
  if (REMOTE_URL.test(raw.trim())) {
    return { target: raw, reason: "SSH/SCP/SFTP access is denied by policy." };
  }
  for (const target of resolveTargets(raw, cwd)) {
    for (const candidate of realPaths(target)) {
      const normalized = candidate.replaceAll("\\", "/");
      for (const rule of RULES) {
        if (!rule.re.test(normalized)) continue;
        if (rule.allow?.test(normalized)) continue;
        return {
          target: raw,
          reason:
            rule.reason ??
            `Blocked: ${candidate} looks like credential material. Ask the user to handle it directly.`,
        };
      }
    }
  }
  return undefined;
}

function findOffenseIn(input: Record<string, unknown>, cwd: string): Offense | undefined {
  for (const key of PATH_KEYS) {
    const raw = input[key];
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (typeof value !== "string" || !value) continue;
      const hit = findOffense(value, cwd);
      if (hit) return hit;
    }
  }
  return undefined;
}

function flattenInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenInput).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value).map(flattenInput).join("\n");
  }
  return "";
}

export function blockedText(value: string): string | undefined {
  return PROTECTED_TEXT.test(value) ? PROTECTED_REASON : undefined;
}

export function offendingPath(
  input: Record<string, unknown>,
  cwd = process.cwd(),
): string | undefined {
  return findOffenseIn(input, cwd)?.target;
}

export default function secretPathGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    const input = event.input as Record<string, unknown> | undefined;
    if (!input) return;
    if (event.toolName === "bash" || event.toolName === "eval") {
      const reason = blockedText(flattenInput(input));
      if (!reason) return;
      return { block: true, reason: `Blocked: ${reason}` };
    }
    if (!FILE_TOOLS[event.toolName]) return;
    const hit = findOffenseIn(input, ctx.cwd ?? process.cwd());
    if (!hit) return;
    return { block: true, reason: hit.reason };
  });
}
