// Blocks reads and writes of credential material for every file-touching tool.
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@oh-my-pi/pi-coding-agent";

const DENY = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.[^/]+$/,
  /(^|\/)\.envrc$/,
  /\.(pem|key|p12|pfx)$/,
  /(^|\/)id_(rsa|ed25519|ecdsa)/,
  /(^|\/)\.ssh\//,
  /(^|\/)\.aws\//,
  /(^|\/)\.gnupg\//,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.pgpass$/,
  /(^|\/)\.docker\/config\.json$/,
];

// Exceptions that are safe to read and are commonly needed.
const ALLOW = [/\.env\.(example|sample|template|schema)$/];

export function offendingPath(input: Record<string, unknown>): string | undefined {
  for (const key of ["path", "file_path", "filePath", "target", "source", "destination"]) {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0) continue;
    if (ALLOW.some((re) => re.test(value))) continue;
    if (DENY.some((re) => re.test(value))) return value;
  }
  return undefined;
}

const FILE_TOOLS = ["read", "write", "edit", "ast_edit", "apply_patch"];

export default function secretPathGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (!FILE_TOOLS.includes(event.toolName)) return;
    const input = event.input as Record<string, unknown>;
    const hit = offendingPath(input);
    if (!hit) return;
    return {
      block: true,
      reason: `Blocked: ${hit} looks like credential material. Ask the user to handle it directly.`,
    };
  });
}
