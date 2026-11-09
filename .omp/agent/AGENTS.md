# Global working notes

Background preferences for how work gets done. Hard boundaries live in
`RULES.md`.

## Working style

- Prefer Bun over npm when both are practical.
- Use the harness's native capabilities first. Do not rebuild tooling that this
  agent already provides unless it demonstrably fails a concrete need.
- Fix the shared root cause rather than patching one call site.
- Keep changes inside the requested scope; name anything you deliberately skip.
- When a browser is needed, open it on the user's Chromium profile:
  `browser.open({ headed: true, persist: true, app: { path: "/home/miguel/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome", args: ["--user-data-dir=/home/miguel/.cache/playwright-mcp-coloso-v2"] } })`
  (their logins/settings live there; only one process may hold that dir, so it
  fails while Playwright MCP is running).
