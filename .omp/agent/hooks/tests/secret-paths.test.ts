import { expect, test } from "bun:test";
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
  for (const path of denied) expect(offendingPath({ path })).toBe(path);
});

test("allows ordinary files and env templates", () => {
  for (const path of allowed) expect(offendingPath({ path })).toBeUndefined();
});

test("scans alternate path keys", () => {
  expect(offendingPath({ file_path: "/x/.env" })).toBe("/x/.env");
  expect(offendingPath({ target: "/x/.pem" })).toBe("/x/.pem");
  expect(offendingPath({ command: "cat /x/.env" })).toBeUndefined();
});
