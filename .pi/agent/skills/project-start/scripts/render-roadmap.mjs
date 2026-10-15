#!/usr/bin/env node
/**
 * Render a stepstone worklist as a self-contained HTML roadmap.
 *
 * Usage:
 *   node render-roadmap.mjs [--worklist .worklist/worklist.json] [--title "Name"]
 *                           [--out docs/roadmap.html] [--archive openspec/changes/archive]
 *                           [--specs openspec/specs] [--repo <url>]
 *                           [--delivered-detail summary|full] [--stdout]
 *
 *   --archive renders a derived "Delivered" section from archived change folders
 *   (YYYY-MM-DD-slug), grouped by month, each one expandable to its own `## Why`, the
 *   capabilities it merged into, and its task-tick count. --specs adds a capability/requirement
 *   count and the relative links from each delivered change to the living spec it updated. Both
 *   are optional and auto-detected relative to the worklist's repository root; pass an empty
 *   value to disable. --repo overrides the repository link, which is otherwise read from the
 *   `origin` git remote.
 *
 *   --delivered-detail summary (the default) caps each `## Why` at WHY_SUMMARY_CHARS and keeps
 *   the page in the 100-130 KB band. `full` embeds the whole proposal, design and tasks verbatim,
 *   which is several hundred KB — the log always says which size you got.
 *
 * Reads only the worklist, the archive and the specs. Writes nothing but the output file.
 * No network, no dependencies. The output is one self-contained file: inline CSS, inline
 * vanilla JS, no external assets, and it opens straight from the filesystem.
 *
 * Conventions it relies on (see ../SKILL.md):
 *   - group is the horizon: Now | Next | Later
 *   - the title is prefixed with the feature and an em dash: "Billing — plans and checkout"
 *   - a description uses `Problem:` / `Appetite:` / `Rabbit hole:` / `No-go:` lines
 * Derived states (Released / Committed / Tentative / Not scheduled) are computed here and never
 * stored — a stored copy would go stale the moment a dependency lands.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const HORIZONS = ["Now", "Next", "Later"];
const SEPARATOR = " — ";
const DONE_STATES = new Set(["done", "archived"]);
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function parseArgs(argv) {
  const args = { worklist: ".worklist/worklist.json", title: null, out: null, stdout: false, archive: null, specs: null, repo: null, deliveredDetail: "summary" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--stdout") args.stdout = true;
    else if (key === "--worklist") args.worklist = argv[++i];
    else if (key === "--title") args.title = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--archive") args.archive = argv[++i];
    else if (key === "--specs") args.specs = argv[++i];
    else if (key === "--repo") args.repo = argv[++i];
    else if (key === "--delivered-detail") args.deliveredDetail = argv[++i];
    else if (key === "--help" || key === "-h") { console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else { console.error(`Unknown argument: ${key}`); process.exit(2); }
  }
  if (args.deliveredDetail !== "summary" && args.deliveredDetail !== "full") {
    console.error(`--delivered-detail takes "summary" or "full", not ${JSON.stringify(args.deliveredDetail)}`);
    process.exit(2);
  }
  return args;
}

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/* ------------------------------------------------------------------ markdown */

/** Escape the three characters that could open markup, before anything else. */
const escapeMd = (text) => String(text ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Inline markdown: inline code first, so its content is never read as bold or as a link; then
 * links; then bold.
 *
 * A link survives only when a browser can actually go there: http/s, or an in-page anchor.
 * **A `.md` target is rendered as plain text** — clicking one opens a raw markdown dump, which is
 * worse than showing nothing (render contract row 17).
 */
function mdInline(text) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = url.replaceAll('"', "%22").replaceAll("'", "%27");
    if (/\.md($|[?#])/i.test(href)) return label;
    if (/^https?:\/\//i.test(href)) return `<a href="${href}" rel="noopener noreferrer">${label}</a>`;
    if (href.startsWith("#")) return `<a href="${href}">${label}</a>`;
    return label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italics are not in row 18's list, but the charter and the proposals both lean on them, and
  // leaving the asterisks visible reads as a bug. Run after bold, whose tags contain no asterisk.
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return out.replace(/\u0000C(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST_RE = /^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
// The source is escaped before the block scan runs, so a quote marker arrives as `&gt;`.
const QUOTE_RE = /^\s*&gt;\s?/;

/** A list. Nested items keep their text and are marked, not silently flattened away. */
function renderList(items, ordered) {
  const tag = ordered ? "ol" : "ul";
  const base = Math.min(...items.map((item) => item.indent));
  return `<${tag}>${items.map((item) => `<li${item.indent > base ? ' class="sub"' : ""}>${item.text}</li>`).join("")}</${tag}>`;
}

/**
 * The markdown subset our own repo docs use (render contract row 18): headings, paragraphs,
 * lists, checkboxes, bold, inline code, fenced blocks, quotes, tables, rules and links. The
 * source is escaped before a single tag is written.
 */
/** The block pass. Lines arrive already escaped, so nothing here escapes a second time. */
function mdBlocks(lines, fences, top) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i += 1; continue; }

    const fence = line.match(/^\u0000F(\d+)\u0000$/);
    if (fence) { out.push(`<pre><code>${fences[Number(fence[1])]}</code></pre>`); i += 1; continue; }

    if (RULE_RE.test(line)) { out.push("<hr>"); i += 1; continue; }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = Math.min(Math.max(heading[1].length, top), 6);
      out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`);
      i += 1; continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { quoted.push(lines[i].replace(QUOTE_RE, "")); i += 1; }
      // Recursing is what lets a quote hold real lists and paragraphs, rather than a column of
      // lines with their markers still showing.
      out.push(`<blockquote>${mdBlocks(quoted, fences, top).join("")}</blockquote>`);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const cells = (row) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) { rows.push(cells(lines[i])); i += 1; }
      out.push(`<table><thead><tr>${head.map((cell) => `<th>${mdInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${mdInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]\s/.test(line);
      const items = [];
      const startsBlock = (index) => LIST_RE.test(lines[index]) || QUOTE_RE.test(lines[index])
        || HEADING_RE.test(lines[index]) || RULE_RE.test(lines[index])
        || /^\u0000F\d+\u0000$/.test(lines[index])
        || (lines[index].includes("|") && TABLE_SEP_RE.test(lines[index + 1] ?? ""));
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const item = lines[i].match(LIST_RE);
        const indent = item[1].replaceAll("\t", "  ").length;
        let text = item[3];
        i += 1;
        // A hard-wrapped item continues on the following lines. Without this the tail becomes a
        // stray paragraph and any **bold** straddling the wrap leaks its asterisks into the page.
        while (i < lines.length && lines[i].trim() !== "" && !startsBlock(i)) {
          text += ` ${lines[i].trim()}`;
          i += 1;
        }
        const task = text.match(TASK_RE);
        items.push({
          indent,
          text: task
            ? `<span class="cb${task[1].toLowerCase() === "x" ? " on" : ""}" role="img" aria-label="${task[1].toLowerCase() === "x" ? "done" : "open"}"></span>${mdInline(task[2])}`
            : mdInline(text),
        });
      }
      out.push(renderList(items, ordered));
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && !LIST_RE.test(lines[i]) && !QUOTE_RE.test(lines[i])
      && !HEADING_RE.test(lines[i]) && !RULE_RE.test(lines[i]) && !/^\u0000F\d+\u0000$/.test(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${mdInline(paragraph.join(" "))}</p>`);
  }
  return out;
}

/**
 * The markdown subset our own repo docs use (render contract row 18): headings, paragraphs,
 * lists, checkboxes, bold, italics, inline code, fenced blocks, quotes, tables, rules and links.
 * The source is escaped before a single tag is written.
 */
function mdToHtml(markdown, options = {}) {
  const top = options.topLevel ?? 2;
  const src = escapeMd(String(markdown ?? "").replace(/\r\n?/g, "\n"));
  const fences = [];
  const body = src.replace(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (_, code) => {
    fences.push(code.replace(/\n+$/, ""));
    return `\u0000F${fences.length - 1}\u0000`;
  });
  return mdBlocks(body.split("\n"), fences, top).join("\n");
}

const STATE_ORDER = ["Released", "Committed", "Tentative", "Not scheduled", "Blocked"];

/**
 * RSI's own reading of the states, so the legend and the derivation cannot drift apart: the
 * table below is the single place each state's meaning is written down.
 */
const STATES = [
  { name: "Committed", def: "In Now, with every dependency already landed.", swatch: "var(--committed)" },
  { name: "Tentative", def: "Not through review yet — it may move or change scope.", swatch: "var(--tentative)" },
  { name: "Not scheduled", def: "Later, or no horizon set.", swatch: "var(--unscheduled)" },
  { name: "Released", def: "Done.", swatch: "var(--released)" },
  { name: "Blocked", def: "A modifier, not a stage: at least one dependency has not landed.", swatch: "var(--blocked)" },
];

const stateClass = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");

function derive(goals) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const landed = (id) => {
    const target = byId.get(id);
    return target ? DONE_STATES.has(target.status) : false;
  };
  const base = goals.map((goal) => {
    const deps = Array.isArray(goal.dependsOn) ? goal.dependsOn : [];
    const blockedBy = deps.filter((id) => !landed(id));
    const satisfied = deps.filter((id) => landed(id));
    const missing = deps.filter((id) => !byId.has(id));
    const horizon = HORIZONS.includes(goal.group) ? goal.group : "Ungrouped";
    const released = DONE_STATES.has(goal.status);
    let state;
    if (released) state = "Released";
    else if (horizon === "Now") state = blockedBy.length === 0 ? "Committed" : "Tentative";
    else if (horizon === "Next") state = "Tentative";
    else state = "Not scheduled";
    const [maybeFeature, ...rest] = String(goal.title ?? "").split(SEPARATOR);
    const feature = rest.length ? maybeFeature.trim() : "";
    const title = rest.length ? rest.join(SEPARATOR).trim() : String(goal.title ?? "");
    return { ...goal, feature, displayTitle: title, horizon, state, blockedBy, satisfied, missing, released };
  });

  // The reverse edge: who this goal is standing in the way of. Derived, never stored.
  const unblocksById = new Map();
  for (const goal of base) {
    for (const dep of Array.isArray(goal.dependsOn) ? goal.dependsOn : []) {
      if (!unblocksById.has(dep)) unblocksById.set(dep, []);
      unblocksById.get(dep).push(goal.id);
    }
  }
  const named = (id) => {
    const target = byId.get(id);
    return target
      ? { id, title: target.title ?? id, feature: target.group ?? "" }
      : { id, title: id, feature: "" };
  };
  return base.map((goal) => ({
    ...goal,
    blockedByNamed: goal.blockedBy.map(named),
    satisfiedNamed: goal.satisfied.map(named),
    missingNamed: goal.missing.map(named),
    unblocksNamed: (unblocksById.get(goal.id) ?? []).map(named),
  }));
}

/**
 * A slug is the change's canonical name, so it is the title. Prettify it for display: uppercase
 * known acronyms, sentence-case the first word. A real H1 title wins when a repo uses one.
 */
const ACRONYMS = new Set([
  "api", "ui", "ux", "ci", "cd", "db", "sql", "ai", "ml", "sso", "jwt", "ocr", "id", "ids",
  "http", "https", "url", "urls", "mcp", "lsp", "qa", "e2e", "pdf", "css", "html", "json",
  "yaml", "mfa", "rbac", "abac", "kpi", "sla", "sre", "cli", "s3",
]);

function prettifySlug(slug) {
  const words = slug.split("-").filter(Boolean).map((word) => {
    const lower = word.toLowerCase();
    return ACRONYMS.has(lower) ? lower.toUpperCase() : lower;
  });
  if (words.length) words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

/**
 * How much of each delivered change's own prose the page carries. The archive is ~97 KB of
 * `## Why` text in total; capping it is what keeps the page in the contract's 100-130 KB band.
 * See references/render-contract.md, "Size discipline".
 */
const WHY_SUMMARY_CHARS = 600;

/** The same discipline for `## What Changes`: the archive holds 195 KB of it (render row 19). */
const WHAT_SUMMARY_CHARS = 600;

/** Collapse a markdown block into one readable paragraph. */
const collapse = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * Checkbox counts over one tasks.md. The shape is `^\s*-\s*\[[ x]\]` — the loose form miscounts
 * nested boxes by one and the strict `^- ` form misses indented ones, so this exact pattern is
 * the one that reproduces the archive's known 1892/2231.
 */
function countTicks(tasks) {
  const lines = String(tasks ?? "").match(/^\s*-\s*\[[ xX]\]/gm) ?? [];
  return { done: lines.filter((line) => /\[[xX]\]/.test(line)).length, total: lines.length };
}

/**
 * The delivered record, read from archived OpenSpec changes. Derived on every render and never
 * stored as goals: the roadmap holds forward work, the archive holds what has shipped.
 *
 * Each entry carries its own evidence — the `## Why` in its own words, the capabilities it merged
 * into, and its task tick — so the Delivered section is a record rather than an undifferentiated
 * grid of 88 tiles.
 */
function readDelivered(archiveDir, detail) {
  if (!archiveDir) return null;
  let entries;
  try { entries = readdirSync(archiveDir, { withFileTypes: true }); } catch { return null; }
  const read = (path) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
  const dated = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(entry.name))
    .map((entry) => {
      const date = entry.name.slice(0, 10);
      const slug = entry.name.slice(11);
      const base = join(archiveDir, entry.name);
      const proposal = read(join(base, "proposal.md")) ?? "";
      let title = prettifySlug(slug);
      const heading = proposal.match(/^#\s+(.+)$/m);
      if (heading) {
        // OpenSpec writes `# Proposal — <slug>` or `# <slug> — Proposal`; neither adds anything,
        // so a label that reduces to the slug loses to the prettified slug. A real title wins.
        const raw = heading[1].trim().replaceAll("`", "")
          .replace(/^\s*Proposal\s*[—:-]\s*/i, "")
          .replace(/\s*[—:-]\s*Proposal\s*$/i, "")
          .trim();
        if (raw && raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") !== slug.toLowerCase()) title = raw;
      }

      // The `## Why` section: what this change was for, in its own words. One archived change
      // has no such section, and that renders as a stated absence rather than a blank.
      const why = collapse((proposal.match(/^##\s+Why\s*\n([\s\S]*?)(?=^##\s|\Z)/m) ?? [])[1]);
      const whatRaw = collapse((proposal.match(/^##\s+What Changes\s*\n([\s\S]*?)(?=^##\s|\Z)/m) ?? [])[1]);

      // Which living specs this change merged into: the capability deltas it carried.
      let capabilities = [];
      try {
        capabilities = readdirSync(join(base, "specs"), { withFileTypes: true })
          .filter((sub) => sub.isDirectory() && existsSync(join(base, "specs", sub.name, "spec.md")))
          .map((sub) => sub.name)
          .sort((a, b) => a.localeCompare(b));
      } catch { /* a change that merged into no capability */ }

      const ticks = countTicks(read(join(base, "tasks.md")));
      const item = {
        date, title, slug, why, whyTruncated: why.length > WHY_SUMMARY_CHARS,
        whatChanges: whatRaw.slice(0, WHAT_SUMMARY_CHARS),
        whatTruncated: whatRaw.length > WHAT_SUMMARY_CHARS,
        capabilities, ticks,
      };
      // Only pay for the verbatim text when it was actually asked for.
      if (detail === "full") {
        item.full = {
          proposal: read(join(base, "proposal.md")),
          design: read(join(base, "design.md")),
          tasks: read(join(base, "tasks.md")),
        };
      }
      return item;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!dated.length) return null;

  // Grouped by month so the shipping cadence is visible, newest month first.
  const byMonth = [];
  for (const entry of dated) {
    const key = entry.date.slice(0, 7);
    let bucket = byMonth.find((b) => b.key === key);
    if (!bucket) {
      bucket = { key, label: `${MONTHS[Number(entry.date.slice(5, 7)) - 1]} ${entry.date.slice(0, 4)}`, entries: [] };
      byMonth.push(bucket);
    }
    bucket.entries.push(entry);
  }
  const ticks = dated.reduce((acc, entry) => ({ done: acc.done + entry.ticks.done, total: acc.total + entry.ticks.total }), { done: 0, total: 0 });
  const truncated = dated.filter((entry) => entry.whyTruncated || entry.whatTruncated).length;
  return { entries: dated, byMonth, ticks, truncated };
}

/** Capability, requirement counts, and the requirement titles the page will render inline. */
function readCapabilities(specsDir) {
  if (!specsDir) return null;
  let entries;
  try { entries = readdirSync(specsDir, { withFileTypes: true }); } catch { return null; }
  const list = [];
  let requirements = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let spec;
    try { spec = readFileSync(join(specsDir, entry.name, "spec.md"), "utf8"); } catch { continue; }
    // Titles only. The spec bodies are ~1 MB across the 45, which no sendable page can hold
    // (render contract row 19).
    const titles = [...spec.matchAll(/^###\s+Requirement:\s*(.+)$/gm)].map((m) => m[1].trim());
    requirements += titles.length;
    list.push({ name: entry.name, titles });
  }
  return list.length ? { capabilities: list.length, requirements, list } : null;
}

/**
 * The charter, read from beside the rendered page. Rendered in full: it is ~10 KB, and it is the
 * page's answer to "what is this project for", which a link cannot give (render contract row 19).
 * A leading `# Title` becomes the section label rather than a second page title.
 */
function readCharter(charterPath) {
  let markdown;
  try { markdown = readFileSync(charterPath, "utf8"); } catch { return null; }
  const lines = markdown.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim() !== "");
  let title = "Project charter";
  if (first !== -1 && /^#\s+/.test(lines[first])) {
    title = lines[first].replace(/^#\s+/, "").trim();
    lines.splice(0, first + 1);
  }
  return { title, markdown: lines.join("\n") };
}

/**
 * The repository link, read from the git remote so the script stays project-agnostic. This is a
 * local subprocess read, not a network call; a failure is not an error, it just means no link.
 */
function readRepoRemote(repoRoot, override) {
  if (override) return { href: override, raw: override };
  try {
    const raw = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!raw) return null;
    const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (ssh) return { href: `https://${ssh[1]}/${ssh[2]}`, raw };
    if (/^https?:\/\//.test(raw)) return { href: raw.replace(/\.git$/, ""), raw };
    return { href: null, raw };
  } catch { return null; }
}

/** How many words of a description survive on the card face before the detail panel. */
const PREVIEW_WORDS = 22;

/** The labels a goal description may use to separate its parts. Order matters: longest first. */
const DESC_LABELS = ["Problem", "Appetite", "Rabbit hole", "No-go", "Source of record", "Source"];
const DESC_LABEL_RE = new RegExp(
  `(?:^|(?<=\\s))(${DESC_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}):\\s`,
  "g",
);

/**
 * Split a description into its labelled parts. Anything before the first label — and any
 * description with no labels at all — comes back as a single untitled paragraph, so a plain
 * sentence renders exactly as well as a full Shape Up description.
 */
function parseDescription(text) {
  const src = String(text ?? "").trim();
  if (!src) return [];
  const matches = [...src.matchAll(DESC_LABEL_RE)];
  if (!matches.length) return [{ label: null, text: src }];
  const parts = [];
  const lead = src.slice(0, matches[0].index).trim();
  if (lead) parts.push({ label: null, text: lead });
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : src.length;
    parts.push({ label: match[1], text: src.slice(start, end).trim() });
  });
  return parts.filter((part) => part.text);
}

function previewOf(parts) {
  if (!parts.length) return "";
  const first = parts[0];
  const words = first.text.split(/\s+/);
  const clipped = words.slice(0, PREVIEW_WORDS).join(" ");
  return words.length > PREVIEW_WORDS ? `${clipped}…` : clipped;
}

function renderDescription(parts) {
  if (!parts.length) return "";
  return parts.map((part) => (part.label
    ? `<p class="desc-part"><span class="desc-label">${esc(part.label)}</span>${esc(part.text)}</p>`
    : `<p class="desc-part desc-lead">${esc(part.text)}</p>`)).join("\n      ");
}

/** One dependency reference: name first, because a name is what a reader can act on. */
function depItem(ref, marker) {
  const label = ref.id === ref.title ? ref.id : ref.title;
  return `<li><span class="dep-marker">${esc(marker)}</span><span class="dep-name">${esc(label)}</span><code class="dep-id">${esc(ref.id)}</code></li>`;
}

function depList(title, refs, marker, empty) {
  // A block with nothing to list and no sentence worth saying is omitted, not rendered empty.
  if (!refs.length && !empty) return "";
  if (!refs.length) return `<div class="dep-block"><h4>${esc(title)}</h4><p class="dep-empty">${esc(empty)}</p></div>`;
  return `<div class="dep-block"><h4>${esc(title)}</h4><ul class="dep-list">${refs.map((ref) => depItem(ref, marker)).join("")}</ul></div>`;
}

function renderCard(g) {
  const parts = parseDescription(g.description);
  const preview = previewOf(parts);
  const links = (Array.isArray(g.links) ? g.links : []).map((url) => {
    let label = "link";
    try {
      const u = new URL(url);
      if (u.hostname.includes("github") || u.hostname.includes("gitlab")) label = "code";
      if (u.pathname.includes("openspec")) label = "spec";
    } catch { /* keep default */ }
    return `<a class="link" href="${esc(url)}" rel="noopener noreferrer">${esc(label)}</a>`;
  }).join("");

  const chips = [];
  for (const ref of g.blockedByNamed) {
    chips.push(`<span class="chip chip-blocked" title="blocked by ${esc(ref.id)}">blocked by ${esc(ref.title)}</span>`);
  }
  for (const ref of g.missingNamed) {
    chips.push(`<span class="chip chip-missing" title="edge names no goal in this worklist">dangling edge → ${esc(ref.id)}</span>`);
  }
  if (g.branch) chips.push(`<span class="chip" title="${esc(g.branch)}">${esc(g.branch)}</span>`);
  for (const ref of g.unblocksNamed.slice(0, 2)) {
    chips.push(`<span class="chip chip-unblocks" title="unblocks ${esc(ref.id)}">unblocks ${esc(ref.title)}</span>`);
  }
  if (g.unblocksNamed.length > 2) {
    chips.push(`<span class="chip">+${g.unblocksNamed.length - 2} more unblocked</span>`);
  }

  const search = `${g.title ?? ""} ${g.feature} ${g.description ?? ""}`.toLowerCase();

  return `<details class="card state-${stateClass(g.state)}"
    data-feature="${esc(g.feature || "—")}"
    data-horizon="${esc(g.horizon)}"
    data-state="${esc(g.state)}"
    data-blocked="${g.blockedByNamed.length ? "1" : "0"}"
    data-search="${esc(search)}">
  <summary>
    ${g.feature ? `<span class="feature">${esc(g.feature)}</span>` : ""}
    <span class="card-title">${esc(g.displayTitle)}</span>
    ${preview ? `<span class="preview">${esc(preview)}</span>` : ""}
    <span class="meta">
      <span class="state">${esc(g.state)}</span>
      ${chips.join("")}
    </span>
  </summary>
  <div class="detail">
    <div class="desc">
      ${renderDescription(parts) || `<p class="desc-part desc-empty">No description recorded for this goal.</p>`}
    </div>
    <div class="deps">
      ${depList("Blocked by", g.blockedByNamed, "▲", "Nothing — every dependency has landed.")}
      ${depList("Already landed", g.satisfiedNamed, "✓", "")}
      ${depList("Unblocks", g.unblocksNamed, "→", "Nothing in this roadmap depends on it.")}
      ${depList("Dangling edges", g.missingNamed, "!", "")}
    </div>
    ${links ? `<div class="links"><span class="links-label">Evidence</span>${links}</div>` : `<div class="links"><span class="links-label">Evidence</span><span class="links-none">no links recorded</span></div>`}
    <div class="facts">
      <span class="fact"><span class="fact-key">id</span><code class="goal-id" title="Click to select the whole id">${esc(g.id)}</code></span>
      <span class="fact"><span class="fact-key">horizon</span>${esc(g.horizon)}</span>
      <span class="fact"><span class="fact-key">status</span>${esc(g.status ?? "—")}</span>
      <span class="fact"><span class="fact-key">created</span>${esc(g.createdAt ?? "—")}</span>
      <span class="fact"><span class="fact-key">updated</span>${esc(g.updatedAt ?? "—")}</span>
      ${g.branch ? `<span class="fact"><span class="fact-key">branch</span><code>${esc(g.branch)}</code></span>` : ""}
    </div>
  </div>
</details>`;
}

function renderLegend() {
  return `<section class="legend" aria-label="Status legend">
  <h2>Status legend</h2>
  <dl class="legend-list">
${STATES.map((s) => `    <div class="legend-item"><dt><i class="swatch" style="background:${s.swatch}"></i>${esc(s.name)}</dt><dd>${esc(s.def)}</dd></div>`).join("\n")}
  </dl>
  <p class="legend-note">States are computed from the horizon and the dependency graph on every
  read, never stored — a stored copy would go stale the moment a dependency landed.</p>
</section>`;
}

function renderStats(goals, counts, delivered, capabilities) {
  const goalStats = [
    ["Committed", String(counts.Committed)],
    ["Tentative", String(counts.Tentative)],
    ["Not scheduled", String(counts["Not scheduled"])],
    ["Released", String(counts.Released)],
    ["Blocked", String(counts.Blocked)],
    ["Total goals", String(goals.length)],
  ].map(([label, value]) => `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></div>`).join("");

  const recordStats = [
    ["Archived changes", delivered ? String(delivered.entries.length) : "—"],
    ["Capabilities", capabilities ? String(capabilities.capabilities) : "—"],
    ["Requirements", capabilities ? String(capabilities.requirements) : "—"],
  ].map(([label, value]) => `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></div>`).join("");

  return `<div class="stats-blocks">
  <section class="stats-block">
    <h2 class="stats-title">Roadmap goals <span>forward work · <code>.worklist/worklist.json</code></span></h2>
    <div class="stats">${goalStats}</div>
    <p class="stats-note"><strong>Released counts goal statuses</strong>, and no goal here is done yet.
    The changes in the Delivered section are the archive, not goals — they are evidence of work that
    shipped, and they are counted separately below.</p>
  </section>
  <section class="stats-block">
    <h2 class="stats-title">Delivered record <span>evidence · <code>openspec/</code></span></h2>
    <div class="stats">${recordStats}</div>
    <p class="stats-note">Read from <code>openspec/changes/archive</code> and
    <code>openspec/specs</code> on every render. Never a goal, never stored.</p>
  </section>
</div>`;
}

function renderFilters(goals) {
  const features = [...new Set(goals.map((g) => g.feature).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const horizons = [...HORIZONS, "Ungrouped"].filter((h) => goals.some((g) => g.horizon === h));
  const states = STATE_ORDER.filter((s) => goals.some((g) => g.state === s || (s === "Blocked" && g.blockedByNamed.length)));
  const option = (value) => `<option value="${esc(value)}">${esc(value)}</option>`;
  return `<div class="filters" role="group" aria-label="Filter the roadmap">
  <label>Feature<select id="f-feature"><option value="">All</option>${features.map(option).join("")}</select></label>
  <label>Horizon<select id="f-horizon"><option value="">All</option>${horizons.map(option).join("")}</select></label>
  <label>State<select id="f-state"><option value="">All</option>${states.map(option).join("")}</select></label>
  <label class="filter-search">Search<input id="f-text" type="search" placeholder="title or description…" autocomplete="off"></label>
  <button id="f-reset" type="button">Reset</button>
  <span class="filter-count" id="f-count"></span>
</div>`;
}

/**
 * One delivered change, expandable to its own evidence.
 *
 * Deliberately terse markup: this template repeats 88 times, so every byte of wrapper, class name
 * and indentation is paid 88 times. Repeated labels live in the stylesheet (`.caps::before`) and
 * the card carries the date in its <time>, so nothing is printed twice. See the size discipline
 * in references/render-contract.md.
 */
function renderDeliveredItem(entry, detail) {
  // Row 21: a chip reveals its capability's requirement list **in place**. The list itself lives in
  // exactly one place — the capability index — and the page JS clones it in on click, so the file
  // carries 220 buttons and no duplicated prose. The button carries no class: it repeats 220 times,
  // and `.caps button` already names it unambiguously.
  const caps = entry.capabilities.map((capability) => `<button data-cap="${esc(capability)}">${esc(capability)}</button>`).join("");
  const pct = entry.ticks.total ? Math.round((entry.ticks.done / entry.ticks.total) * 100) : 0;
  const why = entry.why
    ? `${esc(entry.why.slice(0, WHY_SUMMARY_CHARS))}${entry.whyTruncated ? "…" : ""}`
    : "No <code>## Why</code> section is recorded in this change's proposal.";
  const what = entry.whatChanges
    ? `${esc(entry.whatChanges)}${entry.whatTruncated ? "…" : ""}`
    : "No <code>## What Changes</code> section is recorded in this change's proposal.";
  // Opt-in depth only. In `summary` mode the file is never read at all.
  const full = detail === "full" && entry.full
    ? `<details class="ft"><summary>proposal.md</summary><pre>${esc(entry.full.proposal ?? "— missing —")}</pre></details><details class="ft"><summary>design.md</summary><pre>${esc(entry.full.design ?? "— missing —")}</pre></details><details class="ft"><summary>tasks.md</summary><pre>${esc(entry.full.tasks ?? "— missing —")}</pre></details>`
    : "";
  const capLine = entry.capabilities.length
    ? `<div class="caps">${caps}</div>`
    : `<div class="none">no capability delta recorded</div>`;
  // Repeats 88 times, so the class is short and nothing is said twice: the units for both prose
  // blocks and the tick chip are defined once, in the stylesheet and the section header.
  return `<details class="change" data-ticks="${entry.ticks.done}/${entry.ticks.total}"><summary><time datetime="${esc(entry.date)}">${esc(entry.date)}</time><span class="dt">${esc(entry.title)}</span><span class="dtk">${entry.ticks.done}/${entry.ticks.total}</span></summary><div class="dd"><p class="why">${why}</p><p class="what">${what}</p>${capLine}<code class="ds">${esc(entry.slug)}</code>${full}</div></details>`;
}

/**
 * The living capabilities, each an anchor with its requirement titles. This is what a delivered
 * change's chip jumps to: the spec was 1,018 KB across the 45, so the titles carry the signal and
 * the bodies stay in the repo (render contract row 19).
 */
function renderCapabilityIndex(capabilities) {
  if (!capabilities) return "";
  return `
<section class="caps-index" id="capabilities">
  <h2>Capabilities</h2>
  <div class="sub">${capabilities.capabilities} living specs, ${capabilities.requirements} requirements.
  Requirement titles only — the spec bodies are ~1 MB and stay in the repo.
  Every delivered change above links to its entry here.</div>
  <div class="caps-grid">
${capabilities.list.map((capability) => `    <details class="cap-entry" id="cap-${esc(capability.name)}"><summary><span class="dt">${esc(capability.name)}</span><span class="dtk">${capability.titles.length}</span><a class="plink" href="#cap-${esc(capability.name)}" title="Permanent link to this capability">#</a></summary><div class="dd"><ul class="reqs">${capability.titles.map((title) => `<li>${esc(title)}</li>`).join("")}</ul></div></details>`).join("\n")}
  </div>
</section>`;
}

/** The charter, rendered in full rather than linked. */
function renderCharter(charter) {
  if (!charter) return "";
  return `
<section class="charter" id="charter">
  <h2>${esc(charter.title)}</h2>
  <div class="sub">Rendered in full from <code>docs/PROJECT.md</code>. Sections marked
  <em>reconstructed</em> are assembled from the repo's own sources and not re-confirmed by their
  author; <em>decided</em> marks a call taken when the charter was written.</div>
  <div class="md">
${mdToHtml(charter.markdown, { topLevel: 2 })}
  </div>
</section>`;
}

function renderDelivered(delivered, detail) {
  if (!delivered) return "";
  const oldest = delivered.entries[delivered.entries.length - 1].date;
  const newest = delivered.entries[0].date;
  const tickPct = delivered.ticks.total ? Math.round((delivered.ticks.done / delivered.ticks.total) * 100) : 0;
  const capNote = delivered.truncated
    ? ` Why paragraphs are capped at ${WHY_SUMMARY_CHARS} characters (${delivered.truncated} of ${delivered.entries.length} are longer than that); the whole text is available with <code>--delivered-detail full</code>.`
    : "";
  return `<section class="delivered">
  <h2>Delivered</h2>
  <div class="sub">${delivered.entries.length} archived changes,
  <strong>${esc(oldest)} → ${esc(newest)}</strong>, newest first, grouped by month —
  <strong>${delivered.ticks.done}/${delivered.ticks.total}</strong> tasks ticked (${tickPct}%) across the archive.
  Read from <code>openspec/changes/archive</code>, never stored as goals.
  Expand any change for its own reasons, the capabilities it merged into, and a link to the living spec.${capNote}</div>
${delivered.byMonth.map((month) => `  <div class="delivered-month">
    <h3>${esc(month.label)} <span class="month-count">${month.entries.length}</span></h3>
    <div class="delivered-grid">${month.entries.map((entry) => renderDeliveredItem(entry, detail)).join("")}</div>
  </div>`).join("\n")}
</section>`;
}

function render({ project, title, generatedAt, delivered, capabilities, repo, charter, detail }) {
  const goals = derive(Array.isArray(project.goals) ? project.goals : []);
  const live = goals.filter((g) => !g.released);
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0]));
  for (const g of goals) {
    if (counts[g.state] !== undefined) counts[g.state] += 1;
    if (g.state !== "Released" && g.blockedByNamed.length) counts.Blocked += 1;
  }
  const done = goals.filter((g) => g.released).length;
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;

  const lanes = [...HORIZONS, "Ungrouped"]
    .map((horizon) => {
      const items = goals.filter((g) => g.horizon === horizon);
      if (!items.length) return "";
      const laneDone = items.filter((g) => g.released).length;
      const lanePct = Math.round((laneDone / items.length) * 100);
      const caveat = horizon === "Now"
        ? `<span class="lane-note">committed</span>`
        : horizon === "Ungrouped"
          ? `<span class="lane-note ungrouped">no horizon set</span>`
          : `<span class="lane-note tentative">tentative — may move</span>`;
      return `<section class="lane" data-lane-horizon="${esc(horizon)}">
  <header class="lane-head">
    <h2>${esc(horizon)}</h2>
    ${caveat}
    <span class="lane-count">${laneDone}/${items.length}</span>
  </header>
  <div class="bar"><i style="width:${lanePct}%"></i></div>
  <div class="cards">${items.map(renderCard).join("\n")}</div>
</section>`;
    })
    .join("\n");

  const nowLane = goals.filter((g) => g.horizon === "Now" && !g.released);
  const nextUp = nowLane.find((g) => g.blockedByNamed.length === 0) ?? live.find((g) => g.horizon === "Next");

  const headerLinks = [
    charter ? `<a class="head-link" href="#charter">Project charter</a>` : null,
    capabilities ? `<a class="head-link" href="#capabilities">Capabilities</a>` : null,
    repo && repo.href ? `<a class="head-link" href="${esc(repo.href)}" rel="noopener noreferrer">Repository</a>` : null,
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — roadmap</title>
<style>
:root{
  --bg:#0b0f1a; --panel:#121826; --panel-2:#161d2e; --panel-3:#1b2334; --line:#242d42; --ink:#e6edf7;
  --muted:#8b96ad; --released:#3fb950; --committed:#58a6ff; --tentative:#d29922;
  --unscheduled:#6e7681; --blocked:#f85149; --radius:12px;
}
*{box-sizing:border-box}
body{
  margin:0; background:radial-gradient(1200px 600px at 15% -10%,#16203a 0%,var(--bg) 55%);
  color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  padding:40px 32px 64px; -webkit-font-smoothing:antialiased;
}
h1{margin:0 0 6px;font-size:30px;letter-spacing:-.02em}
h2{letter-spacing:-.01em}
code{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#b9c6de}
a{color:var(--committed)}
.wrap{max-width:1500px;margin:0 auto}
header.top{margin:0 auto 24px}
.sub{color:var(--muted);font-size:13px}
.head-links{display:flex;gap:14px;margin-top:8px;flex-wrap:wrap}
.head-link{font-size:13px;text-decoration:none;border-bottom:1px solid transparent}
.head-link:hover{border-bottom-color:currentColor}
.caveat{
  margin:0 auto 22px;padding:12px 16px;border:1px solid #3a3320;border-radius:var(--radius);
  background:linear-gradient(90deg,#241f10,#1a1c26); color:#e8d9a8; font-size:13px;
}
.caveat strong{color:#ffd479}

/* legend */
.legend{margin:0 auto 22px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.legend h2{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.legend-list{display:grid;gap:8px 24px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:0}
.legend-item{margin:0;display:flex;gap:8px;align-items:baseline;font-size:13px}
.legend-item dt{display:flex;gap:8px;align-items:baseline;font-weight:600;white-space:nowrap;margin:0}
.legend-item dd{margin:0;color:var(--muted)}
.swatch{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none;transform:translateY(-1px)}
.legend-note{margin:12px 0 0;font-size:12px;color:var(--muted)}

/* stats */
.stats-blocks{margin:0 auto 22px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.stats-block{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.stats-title{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.stats-title span{text-transform:none;letter-spacing:0;font-weight:400;font-size:12px}
.stats{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))}
.stat{background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.stat-value{font-size:22px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.stats-note{margin:12px 0 0;font-size:12px;color:var(--muted)}

/* filters */
.filters{
  margin:0 auto 22px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;
  background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px;
  position:sticky;top:0;z-index:5;
}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.filters select,.filters input{
  background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:8px;
  padding:7px 9px;font-size:13px;font-family:inherit;min-width:150px;
}
.filters select:focus,.filters input:focus{outline:2px solid var(--committed);outline-offset:1px}
.filter-search input{min-width:230px}
.filters button{
  background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:8px;
  padding:8px 14px;font-size:13px;font-family:inherit;cursor:pointer;
}
.filters button:hover{border-color:var(--committed);color:#cfe2ff}
.filter-count{margin-left:auto;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;padding-bottom:6px}
/* Row 20: the filter bar is position:sticky, so an anchored element must not land underneath it. */
[id]{scroll-margin-top:96px}
/* And the landed-on entry says so. */
.cap-entry:target{border-left-color:var(--tentative);background:#1e1a10;box-shadow:0 0 0 1px var(--tentative)}
.change:target,.card:target,.lane:target{border-left-color:var(--tentative);box-shadow:0 0 0 1px var(--tentative)}
.filter-empty{display:none;margin:0 auto 22px;color:var(--tentative);font-size:13px}
body.filtered-empty .filter-empty{display:block}

.overall{margin:0 auto 26px}
.overall .bar{height:8px}
.blocked-note{color:var(--blocked)}
.delivered-note{color:var(--released)}

/* lanes */
.lanes{margin:0 auto;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start}
.lane{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
.lane[hidden]{display:none}
.lane-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.lane-head h2{margin:0;font-size:17px}
.lane-note{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--committed)}
.lane-note.tentative{color:var(--tentative)}
.lane-note.ungrouped{color:var(--unscheduled)}
.lane-count{margin-left:auto;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.bar{height:5px;background:#1e2740;border-radius:99px;overflow:hidden;margin-bottom:14px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--committed),#7ee787);border-radius:99px}
.cards{display:flex;flex-direction:column;gap:10px}

/* cards */
.card{background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--unscheduled);border-radius:10px}
.card[hidden]{display:none}
.card.state-released{border-left-color:var(--released);opacity:.8}
.card.state-committed{border-left-color:var(--committed)}
.card.state-tentative{border-left-color:var(--tentative)}
.card.state-not-scheduled{border-left-color:var(--unscheduled)}
.card > summary{
  cursor:pointer;list-style:none;display:block;position:relative;padding:12px 34px 12px 14px;
}
.card > summary::-webkit-details-marker{display:none}
.card > summary::after{
  content:"›";position:absolute;right:14px;top:11px;color:var(--muted);font-size:18px;line-height:1;
  transition:transform .12s ease;
}
.card[open] > summary::after{transform:rotate(90deg)}
.card > summary:hover{background:var(--panel-3);border-radius:9px}
.card > summary:focus-visible{outline:2px solid var(--committed);outline-offset:-2px;border-radius:9px}
.feature{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin-bottom:4px}
.card-title{display:block;font-size:14.5px;font-weight:560;line-height:1.4;margin-bottom:5px}
.preview{display:block;font-size:12.5px;color:var(--muted);line-height:1.5;margin-bottom:8px}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.state{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
.state-released .state{color:var(--released)}
.state-committed .state{color:var(--committed)}
.state-tentative .state{color:var(--tentative)}
.state-not-scheduled .state{color:var(--unscheduled)}
.chip{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:2px 8px;max-width:30ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip-blocked{color:var(--blocked);border-color:#4a2320}
.chip-missing{color:#ffa198;border-color:#4a2320}
.chip-unblocks{color:var(--released);border-color:#1f3a24}

/* card detail */
.detail{border-top:1px solid var(--line);padding:14px;display:grid;gap:14px}
.desc{display:grid;gap:7px}
.desc-part{margin:0;font-size:13px;line-height:1.6;color:#ccd7e8}
.desc-label{
  display:inline-block;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:1px 6px;margin-right:7px;
  transform:translateY(-1px);
}
.desc-empty,.dep-empty{margin:0;font-size:12.5px;color:var(--muted);font-style:italic}
.deps{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.dep-block h4{margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.dep-list{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.dep-list li{display:flex;gap:7px;align-items:baseline;font-size:12.5px;flex-wrap:wrap}
.dep-marker{color:var(--muted);flex:none}
.dep-name{color:#ccd7e8}
.dep-id{color:#7d8ba5;font-size:11px}
.links{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.links-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.link{font-size:11.5px;text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:2px 8px}
.link:hover{border-color:var(--committed)}
.links-none{font-size:12.5px;color:var(--muted);font-style:italic}
.facts{display:flex;gap:14px;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:12px;font-size:11.5px;color:var(--muted)}
.fact{display:flex;gap:6px;align-items:baseline}
.fact-key{text-transform:uppercase;letter-spacing:.07em;font-size:10px}
.goal-id{user-select:all;-webkit-user-select:all;cursor:text;background:var(--panel-3);border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:#cfe2ff}

/* delivered */
.delivered{margin:38px auto 0}
.delivered h2{margin:0 0 4px;font-size:17px}
.delivered .sub{margin-bottom:16px}
.delivered-month{margin-bottom:18px}
.delivered-month h3{
  margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
  display:flex;gap:8px;align-items:center;
}
.delivered-month h3::after{content:"";flex:1;height:1px;background:var(--line)}
.month-count{font-variant-numeric:tabular-nums;color:#6e7681}
.delivered-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));align-items:start}
/* The class name here is printed 88 times, so it is kept short. No backticks in this block: it
   lives inside a JS template literal. */
.change{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--released);border-radius:8px;font-size:12.5px;min-width:0}
.change > summary{display:flex;gap:10px;align-items:baseline;padding:8px 10px;cursor:pointer;list-style:none}
.change > summary::-webkit-details-marker{display:none}
.change > summary:hover{background:var(--panel-3);border-radius:7px}
.change > summary:focus-visible{outline:2px solid var(--committed);outline-offset:-2px;border-radius:7px}
.change time{color:var(--muted);flex:none;font-variant-numeric:tabular-nums}
.dt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtk{flex:none;color:var(--muted);font-size:11px;border:1px solid var(--line);border-radius:99px;padding:1px 7px;font-variant-numeric:tabular-nums}
.dd{border-top:1px solid var(--line);padding:10px;display:grid;gap:8px}
.dd > p{margin:0;font-size:12.5px;line-height:1.6;color:#ccd7e8}
.caps{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
/* The repeated label costs one rule instead of 88 copies. */
.caps::before{content:"merged into";font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
/* The chip is a button: it opens its capability's requirement list here rather than navigating. The
   caret and the colour change are the open/closed state. */
.caps button{font-family:inherit;font-size:11px;line-height:1.5;color:var(--committed);background:none;border:1px solid var(--line);border-radius:99px;padding:2px 8px;cursor:pointer}
.caps button::after{content:"▾";margin-left:5px;font-size:8px;color:var(--muted);vertical-align:1px}
.caps button:hover{border-color:var(--committed)}
.caps button:focus-visible{outline:2px solid var(--committed);outline-offset:1px}
.caps button[aria-expanded="true"]{background:#12213a;border-color:var(--committed);color:#cfe2ff}
.caps button[aria-expanded="true"]::after{content:"▴"}
/* created on demand, full-width so the cloned list wraps onto its own line beneath the chips */
.cap-slot{flex-basis:100%}
.cap-slot:empty{display:none}
.cap-slot .reqs{border-top:0;padding:4px 0 2px 20px}
.dd .none{margin:0;font-size:12.5px;color:var(--muted);font-style:italic}
.ds{color:#7d8ba5;font-size:11px;user-select:all;-webkit-user-select:all;cursor:text;justify-self:start}
.ft{border:1px solid var(--line);border-radius:8px;background:var(--panel-2)}
.ft > summary{padding:6px 10px;cursor:pointer;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.ft pre{margin:0;padding:10px;max-height:420px;overflow:auto;font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#b9c6de;border-top:1px solid var(--line)}

/* The two prose blocks of a delivered change. Their labels cost two rules, not 176 copies. */
.why::before,.what::before{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:3px}
.why::before{content:"why"}
.what::before{content:"what changed"}

/* capability chips and the index they jump to */
.caps-index,.charter{margin:38px auto 0}
.caps-index h2,.charter h2{margin:0 0 4px;font-size:17px}
.caps-index .sub,.charter .sub{margin-bottom:14px}
.caps-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));align-items:start}
.cap-entry{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--committed);border-radius:8px;font-size:12.5px}
.cap-entry > summary{display:flex;gap:10px;align-items:baseline;padding:8px 10px;cursor:pointer;list-style:none}
.cap-entry > summary::-webkit-details-marker{display:none}
.cap-entry > summary:hover{background:var(--panel-3);border-radius:7px}
.cap-entry > summary:focus-visible{outline:2px solid var(--committed);outline-offset:-2px;border-radius:7px}
.reqs{margin:0;padding:6px 10px 10px 26px;display:grid;gap:5px;color:#ccd7e8;font-size:12.5px;border-top:1px solid var(--line)}
/* A shareable permalink per capability, and the click site row 20 has to work on. */
.plink{flex:none;color:var(--muted);text-decoration:none;font-size:11px;line-height:1.5;border:1px solid var(--line);border-radius:5px;padding:0 5px}
.plink:hover{color:var(--committed);border-color:var(--committed)}

/* rendered markdown (charter) */
.md{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px}
.md h2,.md h3,.md h4{margin:20px 0 8px;letter-spacing:-.01em;line-height:1.3}
.md h2:first-child,.md h3:first-child,.md h4:first-child{margin-top:0}
.md h2{font-size:17px}
.md h3{font-size:15px;color:#dbe6f7}
.md h4{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.md p{margin:0 0 10px;font-size:13.5px;line-height:1.65;color:#ccd7e8}
.md ul,.md ol{margin:0 0 12px;padding-left:22px;display:grid;gap:4px}
.md li{font-size:13.5px;line-height:1.6;color:#ccd7e8}
.md li.sub{list-style:circle;color:#b6c2d6}
.md blockquote{margin:0 0 12px;padding:9px 14px;border-left:3px solid var(--committed);background:var(--panel-2);border-radius:0 8px 8px 0}
.md blockquote p{margin:0 0 6px;color:var(--muted);font-size:12.5px}
.md blockquote p:last-child{margin-bottom:0}
.md hr{border:0;border-top:1px solid var(--line);margin:16px 0}
.md pre{background:var(--panel-3);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#b9c6de}
.md code{background:var(--panel-3);border-radius:4px;padding:1px 5px}
.md pre code{background:none;padding:0}
.md table{border-collapse:collapse;width:100%;margin:0 0 14px;font-size:12.5px}
.md th,.md td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
.md th{background:var(--panel-2);color:#dbe6f7;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}
.md td{color:#ccd7e8}
.md strong{color:#e6edf7}
.cb{display:inline-block;width:11px;height:11px;margin-right:7px;border:1px solid var(--muted);border-radius:3px}
.cb.on{background:var(--released);border-color:var(--released)}
footer{margin:36px auto 0;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
footer p{margin:0 0 6px}

@media print{
  body{background:#fff;color:#111;padding:0}
  .wrap,.lanes,.delivered,.filters,.stats-blocks{max-width:none}
  .filters{display:none}
  .legend,.stats-block,.lane,.card,.stat,.delivered-item,.caveat{border-color:#ccc;background:#fff;box-shadow:none}
  .lane-note,.state,.chip,.feature,.stat-label,.desc-label,.dep-block h4{color:#333}
  .preview,.sub,.stats-note,.legend-note{color:#444}
  .card{break-inside:avoid;opacity:1}
  .change{break-inside:avoid}
  .ft pre{max-height:none}
  .cap-entry:target{box-shadow:none}
  .md{background:#fff}
  a{color:#111}
  .goal-id{background:#fff}
}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <h1>${esc(title)}</h1>
  <div class="sub">Roadmap revision ${esc(project.revision ?? "—")} · generated ${esc(generatedAt)}</div>
  ${headerLinks ? `<nav class="head-links">${headerLinks}</nav>` : ""}
</header>

<div class="caveat">
  <strong>Reading this:</strong> only <strong>Now</strong> is committed. Everything in
  <strong>Next</strong> and <strong>Later</strong> is tentative and may move — sequence and
  scope change as we learn, which is the point of committing one horizon at a time.
  Click any card for its description, its dependencies in both directions, and its evidence.
</div>

${renderLegend()}
${renderStats(goals, counts, delivered, capabilities)}
${renderFilters(goals)}
<p class="filter-empty" id="f-empty">No goal matches these filters.</p>

<div class="overall">
  <div class="bar"><i style="width:${pct}%"></i></div>
  <div class="sub">${done} of ${goals.length} goals released (${pct}%)${nextUp ? ` · next up: <strong>${esc(nextUp.displayTitle)}</strong>` : ""}${counts.Blocked ? ` · <span class="blocked-note">${counts.Blocked} blocked by unfinished work</span>` : ""}${delivered ? ` · <span class="delivered-note">${delivered.entries.length} changes delivered</span>` : ""}${capabilities ? ` across ${capabilities.capabilities} capabilities (${capabilities.requirements} requirements)` : ""}</div>
</div>

<div class="lanes">
${lanes}
</div>
${renderDelivered(delivered, detail)}
${renderCapabilityIndex(capabilities)}
${renderCharter(charter)}
</div>

<footer>
  <p>Generated from <code>.worklist/worklist.json</code> by the <code>project-start</code> skill.
  Derived states (Committed / Tentative / Not scheduled) are computed from the horizon and the
  dependency graph on every read and are never stored.</p>
  <p>This file is self-contained: no external assets, no fonts, no network. It opens straight from
  the filesystem, and printing it expands every goal card and every delivered change.</p>
</footer>

<script>
(function () {
  var cards = [].slice.call(document.querySelectorAll("details.card"));
  var lanes = [].slice.call(document.querySelectorAll("section.lane"));
  var feature = document.getElementById("f-feature");
  var horizon = document.getElementById("f-horizon");
  var state = document.getElementById("f-state");
  var text = document.getElementById("f-text");
  var reset = document.getElementById("f-reset");
  var count = document.getElementById("f-count");

  function apply() {
    var f = feature.value, h = horizon.value, s = state.value, t = text.value.trim().toLowerCase();
    var shown = 0;
    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      var ok = (!f || card.dataset.feature === f)
        && (!h || card.dataset.horizon === h)
        && (!s || card.dataset.state === s || (s === "Blocked" && card.dataset.blocked === "1"))
        && (!t || card.dataset.search.indexOf(t) !== -1);
      card.hidden = !ok;
      if (ok) shown += 1;
    }
    for (var j = 0; j < lanes.length; j += 1) {
      var lane = lanes[j];
      lane.hidden = !lane.querySelector("details.card:not([hidden])");
    }
    count.textContent = shown + " of " + cards.length + " goals";
    document.body.classList.toggle("filtered-empty", shown === 0);
  }

  [feature, horizon, state].forEach(function (el) { el.addEventListener("change", apply); });
  text.addEventListener("input", apply);
  reset.addEventListener("click", function () {
    feature.value = ""; horizon.value = ""; state.value = ""; text.value = "";
    apply();
  });

  /**
   * Row 21: a chip opens its capability's requirement list in place. The canonical list stays in the
   * capability index and is cloned in on demand, so no prose is duplicated into the file. The chip
   * is a button, so it cannot navigate, and it sits in the card's body rather than its summary, so
   * clicking it cannot collapse the item being read.
   */
  var chips = [].slice.call(document.querySelectorAll(".caps button"));
  chips.forEach(function (chip) { chip.setAttribute("aria-expanded", "false"); });
  document.addEventListener("click", function (event) {
    var chip = event.target && event.target.closest ? event.target.closest(".caps button") : null;
    if (!chip) return;
    var caps = chip.parentElement;
    if (!caps) return;
    // The slot is created on demand rather than shipped 88 times.
    var slot = caps.querySelector(".cap-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "cap-slot";
      caps.appendChild(slot);
    }
    var wasOpen = chip.getAttribute("aria-expanded") === "true";
    // One list at a time per item, so a second chip replaces the first instead of stacking up.
    [].slice.call(caps.querySelectorAll("button")).forEach(function (other) {
      other.setAttribute("aria-expanded", "false");
    });
    slot.innerHTML = "";
    if (wasOpen) return;
    var source = document.getElementById("cap-" + chip.dataset.cap);
    var list = source ? source.querySelector(".reqs") : null;
    if (list) slot.appendChild(list.cloneNode(true));
    else slot.innerHTML = '<p class="none">no requirement list for this capability</p>';
    chip.setAttribute("aria-expanded", "true");
  });

  // A closed <details> does not print, so open every goal card and every delivered change for
  // the print, then put them back exactly as they were.
  var printables = [].slice.call(document.querySelectorAll("details.card, details.change"));
  var restore = [];
  window.addEventListener("beforeprint", function () {
    restore = printables.map(function (el) { return [el, el.open]; });
    printables.forEach(function (el) { el.open = true; });
  });
  window.addEventListener("afterprint", function () {
    restore.forEach(function (pair) { pair[0].open = pair[1]; });
  });

  /**
   * Row 20: an in-page anchor must land somewhere visible. A collapsed <details> has no height, so
   * the browser's own fragment scroll stops on a one-line row — the bug this replaced. Open every
   * <details> above the target first, then scroll **only if it did not land clear of the sticky
   * bar**, so the settle-time re-check below can never yank a reader who is already in place.
   */
  var settled = false;
  function revealHash(smooth) {
    if (settled) return;
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (err) { return; }
    if (!target) return;
    for (var node = target; node && node !== document.body; node = node.parentElement) {
      if (node.tagName === "DETAILS") node.open = true;
    }
    var bar = document.querySelector(".filters");
    var limit = bar ? bar.getBoundingClientRect().bottom : 0;
    var top = target.getBoundingClientRect().top;
    if (top >= limit + 4 && top < window.innerHeight * 0.5) return;
    target.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }
  // Once the reader takes over, we stop moving their viewport.
  ["wheel", "touchstart", "keydown"].forEach(function (event) {
    window.addEventListener(event, function () { settled = true; }, { passive: true });
  });
  window.addEventListener("hashchange", function () { settled = false; revealHash(true); });
  window.addEventListener("load", function () {
    revealHash(false);
    // Layout can still shift after the fragment scroll (font fallback, grid reflow). Re-assert
    // twice, which catches a first-load shift without taking ownership of the viewport.
    requestAnimationFrame(function () { revealHash(false); });
    setTimeout(function () { revealHash(false); }, 350);
  });

  apply();
  revealHash(false);
})();
</script>
</body>
</html>
`;
}

const args = parseArgs(process.argv.slice(2));
const worklistPath = resolve(process.cwd(), args.worklist);
let project;
try {
  project = JSON.parse(readFileSync(worklistPath, "utf8"));
} catch (error) {
  console.error(`Cannot read worklist at ${worklistPath}: ${error.message}`);
  process.exit(1);
}
const title = args.title || basename(dirname(dirname(worklistPath))) || "Project";
// The worklist lives at <root>/.worklist/worklist.json, so its repository root is two levels up.
const repoRoot = resolve(dirname(worklistPath), "..");
const archiveDir = args.archive === "" ? null : (args.archive ?? resolve(repoRoot, "openspec/changes/archive"));
const specsDir = args.specs === "" ? null : (args.specs ?? resolve(repoRoot, "openspec/specs"));
const delivered = readDelivered(archiveDir, args.deliveredDetail);
const capabilities = readCapabilities(specsDir);
const repo = readRepoRemote(repoRoot, args.repo);

const outPath = resolve(process.cwd(), args.out ?? "docs/roadmap.html");
// The charter sits beside the rendered page. It is rendered, never linked: a `.md` href opens a raw
// markdown dump, which is worse than showing nothing (render contract row 17).
const charter = readCharter(join(dirname(outPath), "PROJECT.md"));

const html = render({
  project, title, repo, delivered, capabilities, charter,
  detail: args.deliveredDetail,
  generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
});

if (args.stdout) {
  process.stdout.write(html);
  process.exit(0);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
const kb = Math.round(html.length / 1024);
console.log(`Wrote ${outPath} (${kb} KB — ${html.length} bytes, ${(project.goals ?? []).length} goals${delivered ? `, ${delivered.entries.length} delivered changes in ${delivered.byMonth.length} months, ${delivered.ticks.done}/${delivered.ticks.total} tasks ticked` : ""}${capabilities ? `, ${capabilities.capabilities} capabilities / ${capabilities.requirements} requirement titles` : ""}${charter ? `, charter ${Math.round(charter.markdown.length / 1024)} KB rendered` : ""}, --delivered-detail ${args.deliveredDetail})`);
// Loud enough that nobody emails a megabyte by accident, and specific about which reason applies.
if (args.deliveredDetail === "full") {
  console.log(`  Note: ${kb} KB — that is the cost of --delivered-detail full, which embeds proposal, design and tasks verbatim. Drop the flag for the summary page.`);
} else if (html.length > 250 * 1024) {
  console.log(`  Note: ${kb} KB is over the ~250 KB ceiling for the summary page. The levers are WHY_SUMMARY_CHARS, WHAT_SUMMARY_CHARS, and the capability index's requirement titles.`);
}
