import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { offendingPath } from "../pre/secret-paths";

const denied = [
  "/repo/.env",
  "/repo/.env.production",
  "/home/u/.ssh/id_ed25519",
  "/home/u/.ssh/config",
  "/home/u/.aws/credentials",
  "/home/u/.gnupg/pubring.kbx",
  "/certs/server.pem",
  "/certs/server.key",
  "/home/u/.npmrc",
  "/home/u/.netrc",
  "/home/u/.pgpass",
  "/home/u/.docker/config.json",
  "/home/u/.kube/config",
  "/home/u/.git-credentials",
  "/home/u/.git/config",
  "/home/u/.config/gh/hosts.yml",
  "/home/u/.claude.json",
  "/home/u/.omp/agent/agent.db",
  "/repo/.envrc",
];
const allowed = [
  "/repo/src/index.ts",
  "/repo/.env.example",
  "/repo/.env.sample",
  "/repo/docs/env.md",
  "/repo/environment.ts",
  "/home/u/.ssh-notes.md",
];

test("blocks credential material", () => {
  for (const p of denied) expect(offendingPath({ path: p })).toBe(p);
});

test("allows ordinary files and env templates", () => {
  for (const p of allowed) expect(offendingPath({ path: p })).toBeUndefined();
});

test("scans alternate path keys and arrays", () => {
  expect(offendingPath({ file_path: "/x/.env" })).toBe("/x/.env");
  expect(offendingPath({ target: "/x/.pem" })).toBe("/x/.pem");
  expect(offendingPath({ paths: ["/x/.env"] })).toBe("/x/.env");
  expect(offendingPath({ command: "cat /x/.env" })).toBeUndefined();
});

test("peels read selectors", () => {
  expect(offendingPath({ path: "/repo/.env:1-5" })).toBe("/repo/.env:1-5");
  expect(offendingPath({ path: "/repo/.npmrc:12" })).toBe("/repo/.npmrc:12");
  expect(offendingPath({ path: "/repo/.docker/config.json:raw" })).toBe(
    "/repo/.docker/config.json:raw",
  );
  expect(offendingPath({ path: "/repo/.env.example:1-5" })).toBeUndefined();
  expect(offendingPath({ path: "~/.ssh/id_rsa" })).toBe("~/.ssh/id_rsa");
});

test("checks archive members and URL forms", () => {
  expect(offendingPath({ path: "/repo/secrets.zip:.env" })).toBe("/repo/secrets.zip:.env");
  expect(offendingPath({ path: "/repo/data.sqlite:.ssh/id_rsa" })).toBe(
    "/repo/data.sqlite:.ssh/id_rsa",
  );
  expect(offendingPath({ path: "file:///repo/.env" })).toBe("file:///repo/.env");
  expect(offendingPath({ path: "ssh://host/repo/file.ts" })).toBe("ssh://host/repo/file.ts");
  expect(offendingPath({ path: "skill://pdf/SKILL.md" })).toBeUndefined();
});

test("resolves symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secret-paths-"));
  try {
    fs.writeFileSync(path.join(dir, ".env"), "X=1");
    fs.symlinkSync(".env", path.join(dir, "notes"));
    expect(offendingPath({ path: "notes" }, dir)).toBe("notes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
